import { Fragment, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpDown, ChevronRight, Layers, ArrowLeftRight, FileSpreadsheet, Presentation } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { MultiSelectFilter } from "@/components/MultiSelectFilter";
import { Pill } from "@/components/Pill";
import { usePortfolio } from "@/context/PortfolioContext";
import { StockLink } from "@/components/StockLink";
import { fmtPct, changeColor, fmtNum, fmtDate } from "@/lib/format";
import {
  sum, sumOrNull, consolidatedMarketValue, dedupedPositions, isFundVehicle,
  holdingRoute, ROUTE_LABEL, holdingBucket, bucketLabel, isMandateHeld,
  mandateLabel, mandateLabelWithOwner,
  MANDATE_BUCKET, DIRECT_EQUITY_BUCKET, UNROUTED_EQUITY_BUCKET,
  holdingReturn, returnModeCoverage, type ReturnMode, holdingYtd, ytdCoverage,
} from "@/lib/analytics";
import { accountIndex, ownerOf, type AccountIndex, engagementOf } from "@/lib/accounts";
import { ownerDisplayName } from "@/lib/owners";
import { loadTransactions, loadSales, type Txn } from "@/lib/ledger";
import { Auditable } from "@/components/Auditable";
import { BasisPill } from "@/components/BasisPill";
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
import { AbsentCell, AbsentSection, DASH } from "@/components/Absent";

type EntityPart = {
  // Per-unit figures are nullable for the same reason they are on Position:
  // 360 ONE marks its AIF at a total value and prints no NAV per unit.
  entity: string; quantity: number; avgCost: number | null; currentPrice: number | null;
  costBasis: number | null; marketValue: number; unrealizedPnL: number | null; returnPct: number | null; costNA: boolean;
  /** How the entity came to hold it — a manager's mandate, or its own account. */
  routes: string[];
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
   * The mandate's name WITHOUT the owner qualifier — `mandateLabel`. `Row.security`
   * carries the qualified one (`mandateLabelWithOwner`) because four of the ten
   * mandates share a strategy name with another; inside this row's own expansion
   * there is nothing to disambiguate against, so the prose uses the short name.
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
  entities: string[]; parts: EntityPart[]; quantity: number | null; avgCost: number | null; currentPrice: number | null;
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
  /** Set on `kind === "mandate"` and nowhere else. */
  mandate?: MandateInfo;
};
type SortKey = "security" | "marketValue" | "returnPct" | "unrealizedPnL" | "weight" | "dayChange";

/**
 * WHICH SECTION A HOLDING BELONGS IN. `holdingBucket` decides; this only supplies
 * the engagement, which is a fact about the ACCOUNT and never about the position.
 */
const bucketFor = (idx: AccountIndex, p: Position) => holdingBucket(p, engagementOf(idx, p) || null);
const heldUnderMandate = (idx: AccountIndex, p: Position) => isMandateHeld(engagementOf(idx, p) || null);

/**
 * Sections in reading order: what the family chose itself, then what it handed
 * to a manager, then the wrappers, then cash.
 *
 * `UNROUTED_EQUITY_BUCKET` is in the list because that — and NOT the raw
 * `"Equity"` — is what `holdingBucket` returns for a share whose account states
 * no route. No such account is in this book, and if one arrives it gets its own
 * section between the two routed ones rather than being folded into either,
 * neither of which would be true of it. Spelling it `"Equity"` here made the
 * entry dead: the key that actually arrives fell through `bucketOrd`'s `i < 0`
 * branch and sorted the section BELOW Cash, which is the opposite of what this
 * comment claimed.
 */
const BUCKET_ORDER = [DIRECT_EQUITY_BUCKET, MANDATE_BUCKET, UNROUTED_EQUITY_BUCKET, "ETF", "Mutual Fund", "AIF", "Bond", "Structured Product", "Unlisted", "Cash"];
const bucketOrd = (b: string) => { const i = BUCKET_ORDER.indexOf(b); return i < 0 ? BUCKET_ORDER.length : i; };

// Weight, P&L and return all move with the live price, so they no longer match
// any cell in the workbook — an audit link would point at a different number.
// Live cells therefore render plain, and only rows still on their workbook mark
// keep the trace. The inputs that don't move (quantity, cost) keep theirs either way.
const LIVE_CELL = "Recalculated from the live price. Quantity and cost come from the ledger; this figure is worked out from them, so it has no workbook cell to trace to.";

export function PortfolioMonitor() {
  const { portfolio, consolidated, basis, displayCurrency, fmtFromBase } = usePortfolio();
  const [view, setView] = useState<"holdings" | "transactions">("holdings");
  const [consolidate, setConsolidate] = useState(true);
  // These three filters are global — they drive both the Holdings table and the
  // Transactions tape at once. `selected` is a set of security names (empty = all).
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sector, setSector] = useState("All");
  const [entity, setEntity] = useState("All");
  // Category filter — Direct Equity / PMS mandates / AIF / Mutual Fund / ETF /
  // Cash were shown in one flat list, so a ₹176 Cr AIF folio sat between two
  // equity lines as if it were the same kind of thing. It filters to one BUCKET
  // (`holdingBucket`), not to an asset class: what a reader is choosing between
  // here is shares the family bought and mandates it handed to a manager, and
  // those are the same asset class.
  const [bucket, setBucket] = useState("All");
  /**
   * ABSOLUTE or CAGR, and the guard is not here — see `holdingReturn`. Absolute
   * is the default because it is the figure every row can answer; CAGR is
   * licensed only by a measured holding period of at least a year.
   */
  const [returnMode, setReturnMode] = useState<ReturnMode>("absolute");
  const [sortKey, setSortKey] = useState<SortKey>("marketValue");
  const [asc, setAsc] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [exporting, setExporting] = useState(false);
  const [deckBusy, setDeckBusy] = useState(false);
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
  const sectors = useMemo(() => ["All", ...Array.from(new Set(positions.map((p) => p.sector))).sort()], [positions]);
  const entities = useMemo(() => ["All", ...Array.from(new Set(positions.map((p) => ownerOf(accIdx, p)))).sort()], [positions, accIdx]);
  // Buckets present, in a fixed reading order (own → mandates → wrappers → cash).
  const buckets = useMemo(
    () => ["All", ...Array.from(new Set(positions.map((p) => bucketFor(accIdx, p)))).sort((a, b) => bucketOrd(a) - bucketOrd(b))],
    [positions, accIdx],
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
  const { rows, totMV, totCost, totPnL, rawMV, costedMV, costedCount, heldCount, weightBase, weightCount } = useMemo(() => {
    let base = positions;
    if (entity !== "All") base = base.filter((p) => ownerOf(accIdx, p) === entity);
    if (sector !== "All") base = base.filter((p) => p.sector === sector);
    if (bucket !== "All") base = base.filter((p) => bucketFor(accIdx, p) === bucket);
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
    const totalMV = consolidatedMarketValue(base);

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
        bucket: MANDATE_BUCKET,
        // A mandate holds many securities bought on many dates. There is no one
        // window to annualise it over, so CAGR renders absent on these rows.
        heldSince: null,
        key: "mandate:" + accountId,
        /**
         * The mandate's own name, from `mandateLabelWithOwner` and never
         * re-derived here. FOUR OF THIS BOOK'S TEN MANDATES SHARE A STRATEGY
         * NAME with another one — the same strategy run for two members
         * (Goldstandard's Aristos, SVAN's Velocity, Green Lantern's GLC Growth,
         * V.E.C's Small and Mid-Cap) — so listed on strategy alone this section
         * draws four pairs of identically-named rows and a reader cannot tell
         * which is whose. The helper qualifies the name with the owner for
         * exactly that, and falls back to the house, then to a stated absence,
         * rather than to the raw accountId slug the inline version printed.
         */
        security: mandateLabelWithOwner(acc, ownerOf(accIdx, ps[0])),
        securityKey: "", sector: "", assetClass: "",
        entities: [...new Set(ps.map((x) => ownerOf(accIdx, x)))],
        parts: [],
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
    if (consolidate) {
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
      const m = new Map<string, Position[]>();
      for (const p of rest) {
        const k = bucketFor(accIdx, p) + " | " + p.securityKey;
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
        return {
          kind: "security" as const, bucket: bucketFor(accIdx, ps[0]),
          key: ps[0].securityKey, security: ps[0].security, securityKey: ps[0].securityKey, sector: ps[0].sector, assetClass: ps[0].assetClass,
          entities: Array.from(new Set(ps.map((x) => ownerOf(accIdx, x)))), parts: entityParts(dps, accIdx), quantity: qty,
          avgCost: !costNA && qty > 0 ? (cost as number) / qty : null, currentPrice: ps[0].currentPrice,
          costBasis: cost, marketValue: mv, unrealizedPnL: pnl,
          returnPct: !costNA && pnl !== null && (cost as number) > 0 ? (pnl / (cost as number)) * 100 : null,
          weight: weightBase > 0 ? mv / weightBase : 0,
          costNA,
          heldSince,
          live,
          dayChange: sum(dps.map((x) => x.dayChange ?? 0)),
          dayChangePct: ps[0].dayChangePct ?? null,
          liveMV: live ? mv : 0,
          realizedKeys: [ps[0].securityKey],
        };
      });
    } else {
      out = rest.map((p) => ({
        kind: "security" as const, bucket: bucketFor(accIdx, p),
        key: p.securityKey + "@" + p.accountId, security: p.security, securityKey: p.securityKey, sector: p.sector, assetClass: p.assetClass,
        entities: [ownerOf(accIdx, p)], parts: [], quantity: p.quantity, avgCost: p.avgCost, currentPrice: p.currentPrice,
        costBasis: p.costBasis, marketValue: p.marketValue, unrealizedPnL: p.unrealizedPnL,
        returnPct: p.returnPct, weight: weightBase > 0 ? p.marketValue / weightBase : 0,
        costNA: !!p.costUnavailable || p.costBasis === null,
        heldSince: p.heldSince,
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
    out.sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
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
    const db = dedupedPositions(base);
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
    return {
      rows: out, totMV: totalMV,
      totCost: sumOrNull(db.map((x) => x.costBasis)),
      totPnL: sumOrNull(db.map((x) => x.unrealizedPnL)),
      rawMV: sum(out.map((r) => r.marketValue)),
      costedMV: sum(costed.map((x) => x.marketValue)),
      costedCount: costed.length,
      heldCount: db.length,
      weightBase, weightCount,
    };
  }, [positions, accIdx, mandateTotals, consolidate, selected, sector, entity, bucket, sortKey, asc]);
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
         */
        const seen = new Set<string>();
        let subtotal = 0;
        let collapsed = 0;
        for (const r of rs) {
          if (r.dedupeGroup) {
            if (seen.has(r.dedupeGroup)) { collapsed += r.marketValue; continue; }
            seen.add(r.dedupeGroup);
          }
          subtotal += r.marketValue;
        }
        // HOW MANY HOLDINGS THE SECTION STANDS FOR, which is not how many rows it
        // draws: a mandate row stands for every share inside it, so the PMS
        // heading counts 281 across 10 rows. Counting rows there would report the
        // section as ten holdings and quietly retire 271 of them from the page.
        const holdings = rs.reduce((n, r) => n + (r.mandate ? r.mandate.holdings.length : 1), 0);
        return { key, rows: rs, subtotal, collapsed, holdings };
      })
      .sort((a, b) => bucketOrd(a.key) - bucketOrd(b.key));
  }, [rows]);
  const showBucketSections = bucket === "All" && bucketGroups.length > 1;
  // NULL when the visible rows carry no cost between them — the total-return
  // cell then renders `—` instead of a 0.00% nobody measured.
  const totalRet = totCost !== null && totPnL !== null && totCost > 0 ? (totPnL / totCost) * 100 : null;
  // In the by-entity view the displayed rows include both members' copies of a
  // dually-reported holding; name the gap so the footer (consolidated) reads true.
  const dupGap = !consolidate && rawMV - totMV > 1 ? rawMV - totMV : 0;
  // The market value the Invested and Unrealised P&L columns do NOT stand behind.
  // Rendered whenever it is worth more than a rupee, because the size of it is
  // the whole point: 61 of 370 positions here, and 96% of the book's value.
  const uncostedMV = totMV - costedMV > 1 ? totMV - costedMV : 0;
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
  const weightScope = [entity !== "All" ? entity : null, sector !== "All" ? sector : null, bucket !== "All" ? bucketLabel(bucket) : null].filter(Boolean).join(" · ");
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
  const setMode = (next: boolean) => { setConsolidate(next); setExpanded(new Set()); };
  const money = (n: number | null | undefined, sign?: boolean) => fmtFromBase(n, { compact: true, sign });
  // Export the whole tab (all holdings + the full transaction tape, unfiltered) to a
  // styled workbook. exceljs is code-split so it only loads on demand.
  // The review deck. `pptxgenjs` is code-split the same way exceljs is, so a
  // megabyte of deck writer never reaches the main bundle.
  //
  // It is handed the DEDUPED set and the current basis, and it prints the basis
  // on every slide: a deck built on live prices and one built on statement
  // marks are different documents, and the reader has to be able to tell them
  // apart weeks later with only the file in front of them.
  const handleDeck = async () => {
    if (deckBusy) return;
    setDeckBusy(true);
    try {
      const { exportReviewDeck } = await import("@/lib/exportDeck");
      await exportReviewDeck({
        portfolio, consolidated, basis,
        fmt: (inr: number) => fmtFromBase(inr, { compact: false }),
        currency: displayCurrency,
      });
    } catch (e) {
      console.error("Deck export failed", e);
    } finally {
      setDeckBusy(false);
    }
  };

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
      <PageHeader eyebrow="Daily" title="Portfolio Monitor"
        right={<div className="flex items-center gap-2">
          <BasisPill liveText="Live prices" hint="Quantity and cost come from the statements; value, weight and return are rebuilt from live prices where a quote exists." />
          {view === "holdings" && <Pill tone="info">{rows.length} rows</Pill>}
        </div>} />

      {/*
        ONE CHROME ROW, NOT THREE. The filters, the view toggle and the two
        export buttons each had a line of their own, so ~130px of the first
        screen was spent on controls before a single holding was drawn — on a
        table whose whole job is to list holdings. They share one wrapping row
        now, at `text-xs`, which is what "use the empty space more efficiently"
        actually costs: nothing but the chrome's own generosity.
      */}
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <div className="inline-flex w-fit items-center gap-0.5 rounded-md border border-ink-700 bg-ink-800/60 p-0.5">
          {(["holdings", "transactions"] as const).map((m) => (
            <button key={m} type="button" onClick={() => setView(m)}
              className={`flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors ${view === m ? "bg-champagne-500 text-ink-950 shadow-glow" : "text-slate-400 hover:bg-ink-700/60 hover:text-slate-200"}`}>
              {m === "holdings" ? <Layers className="h-3.5 w-3.5" /> : <ArrowLeftRight className="h-3.5 w-3.5" />}
              {m === "holdings" ? "Holdings" : "Transactions"}
            </button>
          ))}
        </div>
        <MultiSelectFilter options={securityNames} selected={selected} onChange={setSelected} dense
          allLabel="All holdings" unit="holdings" placeholder="Search holdings…" className="w-56 max-w-full" />
        <select value={sector} onChange={(e) => setSector(e.target.value)} className="rounded-md border border-ink-700 bg-ink-800 px-2 py-1 text-xs text-slate-200 ring-focus">
          {sectors.map((s) => <option key={s} value={s}>{s === "All" ? "All sectors" : s}</option>)}
        </select>
        <select value={entity} onChange={(e) => setEntity(e.target.value)} className="rounded-md border border-ink-700 bg-ink-800 px-2 py-1 text-xs text-slate-200 ring-focus">
          {entities.map((s) => <option key={s} value={s}>{s === "All" ? "All entities" : s}</option>)}
        </select>
        {/* Categories, not asset classes: "PMS mandates" is a bucket rather than
            a class (§5 — a mandate is a relationship), and it is the choice a
            reader of this table is actually making. */}
        <select value={bucket} onChange={(e) => setBucket(e.target.value)} className="rounded-md border border-ink-700 bg-ink-800 px-2 py-1 text-xs text-slate-200 ring-focus">
          {buckets.map((s) => <option key={s} value={s}>{s === "All" ? "All categories" : bucketLabel(s)}</option>)}
        </select>
        {/*
          ABSOLUTE vs CAGR. The guard lives in `holdingReturn`, not here: under a
          year the cell falls back to the ABSOLUTE figure and labels it, and a
          holding whose start date nobody reports renders absent. So this switch
          can never turn a four-month gain into an annual rate.
        */}
        {view === "holdings" && (
          <div className="inline-flex w-fit items-center gap-0.5 rounded-md border border-ink-700 bg-ink-800/60 p-0.5"
            title="Absolute is return on cost over however long the holding has been held. CAGR annualises it — and only where a statement reports when the holding was bought and it has been held at least a year.">
            {(["absolute", "cagr"] as const).map((m) => (
              <button key={m} type="button" onClick={() => setReturnMode(m)}
                className={`rounded px-2 py-1 text-xs font-medium transition-colors ${returnMode === m ? "bg-champagne-500 text-ink-950 shadow-glow" : "text-slate-400 hover:bg-ink-700/60 hover:text-slate-200"}`}>
                {m === "absolute" ? "Absolute" : "CAGR"}
              </button>
            ))}
          </div>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          {view === "holdings" && (
            <button onClick={() => setMode(!consolidate)}
              className={`rounded-md border px-2 py-1 text-xs transition-colors ${consolidate ? "border-champagne-500/40 bg-champagne-500/10 text-champagne-400" : "border-ink-700 bg-ink-800 text-slate-300 hover:bg-ink-700/60"}`}>
              {consolidate ? "By security" : "By entity"}
            </button>
          )}
          <button onClick={handleExport} disabled={exporting}
            className="inline-flex items-center gap-1 rounded-md border border-champagne-500/40 bg-champagne-500/10 px-2 py-1 text-xs font-medium text-champagne-400 transition-colors hover:bg-champagne-500/20 disabled:opacity-60"
            title="Download the full Portfolio Monitor — holdings and the transaction tape — as a styled Excel workbook">
            <FileSpreadsheet className="h-3.5 w-3.5" /> {exporting ? "Exporting…" : "Export Excel"}
          </button>
          <button onClick={handleDeck} disabled={deckBusy}
            className="inline-flex items-center gap-1 rounded-md border border-ink-600 px-2 py-1 text-xs font-medium text-slate-300 transition-colors hover:border-ink-500 disabled:opacity-60"
            title="Download a PowerPoint review deck. Every slide carries the basis and the as-of date, because a slide travels without its deck.">
            <Presentation className="h-3.5 w-3.5" /> {deckBusy ? "Building…" : "Review deck"}
          </button>
        </div>
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
                  <Th right onClick={sortBtn("marketValue")}>Market value</Th>
                  <Th right onClick={sortBtn("weight")}>Weight</Th>
                  <Th right onClick={sortBtn("unrealizedPnL")}>Unreal. P&L</Th>
                  <th className="label-xs px-2 py-1.5 text-right font-medium whitespace-nowrap">Realised P&L</th>
                  <Th right onClick={sortBtn("returnPct")}>{returnMode === "cagr" ? "Return p.a." : "Return"}</Th>
                  {/*
                    THE HOLDING'S OWN YEAR TO DATE — not the share's market move
                    since January, which is a different measurement and is never
                    substituted for it. Measurable only where the holding was
                    OPENED during the year, because then there is no opening
                    value to be missing; every other row renders a dash naming
                    what it would take. See `holdingYtd`.
                  */}
                  <th className="label-xs px-2 py-1.5 text-right font-medium">YTD</th>
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
                      <tr className="bg-ink-900/50">
                        <td colSpan={14} className="px-2 py-1.5">
                          <span className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-champagne-500">
                            {bucketLabel(grp.key)}
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
                          </span>
                        </td>
                      </tr>
                    )}
                    {grp.rows.map((r) => {
                  const isOpen = expanded.has(r.key);
                  const multi = r.entities.length > 1;
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
                      <tr className="hover:bg-ink-700/40">
                        {/* NO "cost n/a" BADGE BESIDE THE NAME. The row already
                            says it four times over — Avg cost, Invested,
                            Unrealised P&L and Return each render an em dash off
                            this same `costNA` flag — so the chip was a fifth
                            statement of one fact, sitting in the one column a
                            reader scans for the security's NAME. The flag stays
                            and every dash it drives stays; only the badge is gone. */}
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
                                  title={`${m.manager} — account ${m.accountNo}. Open the mandate drill-down.`}
                                  className="font-medium text-slate-100 underline decoration-dotted decoration-slate-500/40 underline-offset-[3px] transition-colors hover:text-champagne-400 hover:decoration-champagne-500">
                                  {r.security}
                                </Link>
                                <Pill tone="core">PMS mandate</Pill>
                              </div>
                              <span className="pl-5 text-[11px] text-slate-500">
                                {m.manager} · account {m.accountNo} ·{" "}
                                {m.holdings.length < m.accountCount
                                  ? <>{m.holdings.length} of {m.accountCount} holdings match the filters — the mandate itself holds {fmtFromBase(m.accountMV, { compact: true })}</>
                                  : <>{m.holdings.length} {m.holdings.length === 1 ? "holding" : "holdings"}</>}
                              </span>
                            </div>
                          ) : (
                            <span className="font-medium text-slate-100"><StockLink securityKey={r.securityKey} name={r.security} /></span>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-right mono text-slate-300 whitespace-nowrap">
                          {r.quantity === null
                            ? <AbsentCell reason="a mandate is an account, not a security: the shares inside it carry the quantities and it carries none. A 0 here would say the manager holds nothing." />
                            : fmtNum(r.quantity)}
                        </td>
                        <td className="px-2 py-1.5 text-right mono text-slate-400 whitespace-nowrap">
                          {m ? <AbsentCell reason="an average cost per unit needs one security; this row rolls up the mandate's holdings, each with a cost of its own" />
                            : r.costNA ? "—"
                            : r.avgCost === null ? <AbsentCell reason="this provider prints no per-unit cost for the holding" />
                            : fmtFromBase(r.avgCost)}
                        </td>
                        <td className="px-2 py-1.5 text-right mono text-slate-400 whitespace-nowrap">{r.costNA ? "—" : fmtFromBase(r.costBasis, { compact: true })}</td>
                        {/* A live price comes from the quote feed, not the workbook, so it
                            carries no audit link back to the ledger. Only a workbook mark
                            does — and it's flagged so it can't pass as current. */}
                        <td className="px-2 py-1.5 text-right mono text-slate-400 whitespace-nowrap">
                          {m
                            ? <AbsentCell reason="a mandate has no price per unit — it is an account, not a security" />
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
                          {r.live
                            ? partLive
                              ? <>{fmtFromBase(r.marketValue, { compact: true })}
                                  <span className="ml-1 cursor-help text-[10px] text-amber-400/80" title={mixedBasisNote}>◦</span></>
                              : fmtFromBase(r.marketValue, { compact: true })
                            : fmtFromBase(r.marketValue, { compact: true })}
                        </td>
                        <td className="px-2 py-1.5 text-right mono text-slate-400 whitespace-nowrap" title={r.live ? mixedBasisNote : undefined}>
                          {r.live ? `${(r.weight * 100).toFixed(1)}%`
                                  : <Auditable formula={{
                                      title: "Weight",
                                      excel: "= Market value ÷ Total market value × 100",
                                      plain: weightPlain,
                                      worked: `= ${money(r.marketValue)} ÷ ${money(weightBase)} × 100 = ${(r.weight * 100).toFixed(1)}%`,
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
                          ABSOLUTE, OR ANNUALISED WHERE A MEASURED YEAR LICENSES IT.
                          `holdingReturn` decides; this cell only draws. Under a year
                          it returns the ABSOLUTE figure and the cell marks it `abs`,
                          so the column never passes one basis off as the other — the
                          same discipline the mixed-basis market value already keeps.
                        */}
                        <td className={`px-2 py-1.5 text-right mono whitespace-nowrap ${r.costNA ? "text-slate-500" : changeColor(r.returnPct)}`} title={r.live && !r.costNA ? mixedBasisNote : undefined}>
                          {r.costNA ? "—" : (() => {
                            const ret = holdingReturn(r, returnMode, portfolio.asOf);
                            if (ret.kind === "absent") return <AbsentCell reason={ret.reason} />;
                            if (ret.kind === "cagr") return (
                              <span title={`Annualised over the ${ret.heldDays} days since ${fmtDate(ret.since)}, the oldest unit still held. ${fmtPct(r.returnPct, { sign: true })} in total.`}>
                                {fmtPct(ret.pct, { sign: true })}
                              </span>
                            );
                            const body = r.live
                              ? fmtPct(ret.pct, { sign: true })
                              : <Auditable formula={returnFormula(r.marketValue, r.costBasis, r.returnPct, money)}>{fmtPct(ret.pct, { sign: true })}</Auditable>;
                            if (returnMode === "absolute") return body;
                            // CAGR mode, guard fired: the absolute figure, marked.
                            return (
                              <span title={ret.heldDays === null
                                ? "Held for an unreported period, so this is the total return on cost and not an annual rate."
                                : `Held ${ret.heldDays} days — under a year, so this is the total return on cost. Annualising it would state a rate for a year this holding has not seen.`}>
                                {body}<span className="ml-1 text-[10px] text-amber-400/80">abs</span>
                              </span>
                            );
                          })()}
                        </td>
                        <td className="px-2 py-1.5 text-right mono whitespace-nowrap">
                          {(() => {
                            const y = holdingYtd(r, portfolio.asOf);
                            return y.kind === "absent"
                              ? <AbsentCell reason={y.reason} />
                              : <span className={changeColor(y.pct)}
                                  title={`Opened ${fmtDate(y.since)}, during the current year — so its year-to-date return is its whole return since purchase. It held nothing on 1 January, so no opening value is missing.`}>
                                  {fmtPct(y.pct, { sign: true })}
                                </span>;
                          })()}
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
                      {/* THE MANDATE'S OWN HOLDINGS — the drill-down the family
                          asked for, in place. Each share appears here and in the
                          mandate's row above, and nowhere beside the shares the
                          family bought itself. */}
                      {m && isOpen && (
                        <tr className="bg-ink-900/60">
                          <td colSpan={14} className="px-3 pb-3 pt-1">
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
                      {!m && multi && isOpen && (
                        <tr className="bg-ink-900/60">
                          <td colSpan={14} className="px-3 pb-3 pt-1">
                            <div className="overflow-x-auto rounded-lg border border-ink-700 bg-ink-800">
                              <table className="min-w-full text-[12px]">
                                <thead>
                                  <tr className="border-b border-ink-700/70">
                                    <th className="label-xs px-3 py-1.5 text-left font-medium">Owning entity</th>
                                    <th className="label-xs px-3 py-1.5 text-right font-medium">Qty</th>
                                    <th className="label-xs px-3 py-1.5 text-right font-medium">Avg cost</th>
                                    <th className="label-xs px-3 py-1.5 text-right font-medium">Market value</th>
                                    <th className="label-xs px-3 py-1.5 text-right font-medium">% of holding</th>
                                    <th className="label-xs px-3 py-1.5 text-right font-medium">Unreal. P&L</th>
                                    <th className="label-xs px-3 py-1.5 text-right font-medium">Return</th>
                                    {/* The route is a descriptor, not a figure — the
                                        owning entity is this table's row identity. */}
                                    <th className="label-xs px-3 py-1.5 text-left font-medium">Held via</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-ink-700/50">
                                  {r.parts.map((pt) => (
                                    <tr key={pt.entity}>
                                      <td className="px-3 py-1.5"><span className="text-slate-200">{pt.entity}</span></td>
                                      <td className="px-3 py-1.5 text-right mono text-slate-300">{fmtNum(pt.quantity)}</td>
                                      <td className="px-3 py-1.5 text-right mono text-slate-400 whitespace-nowrap">{pt.costNA ? "—" : pt.avgCost === null ? <AbsentCell reason="this provider prints no per-unit cost for the holding" /> : fmtFromBase(pt.avgCost)}</td>
                                      <td className="px-3 py-1.5 text-right mono text-slate-100">{fmtFromBase(pt.marketValue, { compact: true })}</td>
                                      <td className="px-3 py-1.5 text-right mono text-slate-400">{r.marketValue > 0 ? ((pt.marketValue / r.marketValue) * 100).toFixed(1) : "0.0"}%</td>
                                      <td className={`px-3 py-1.5 text-right mono ${pt.costNA ? "text-slate-500" : changeColor(pt.unrealizedPnL)}`}>{pt.costNA ? "—" : fmtFromBase(pt.unrealizedPnL, { compact: true, sign: true })}</td>
                                      <td className={`px-3 py-1.5 text-right mono ${pt.costNA ? "text-slate-500" : changeColor(pt.returnPct)}`}>{pt.costNA ? "—" : fmtPct(pt.returnPct, { sign: true })}</td>
                                      <td className="px-3 py-1.5 text-slate-400">{pt.routes.join(" + ")}</td>
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
                  </Fragment>
                ))}
                {rows.length === 0 && <tr><td colSpan={14} className="py-12 text-center text-sm text-slate-500">No positions match your filters.</td></tr>}
              </tbody>
              <tfoot className="sticky bottom-0 bg-ink-800">
                <tr className="border-t border-ink-700 font-semibold">
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
                  <td className="px-2 py-1.5"></td>
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
                  <td className={`px-2 py-1.5 text-right mono whitespace-nowrap ${changeColor(totPnL)}`} title={feedLive ? LIVE_CELL : undefined}>
                    {feedLive ? fmtPct(totalRet, { sign: true })
                              : <Auditable formula={{ title: "Total return", excel: "= Total P&L ÷ Total cost × 100", plain: "The whole listed book's gain or loss versus what it cost.", worked: `= ${money(totPnL)} ÷ ${money(totCost)} × 100 = ${fmtPct(totalRet, { sign: true })}` }}>{fmtPct(totalRet, { sign: true })}</Auditable>}
                  </td>
                  {/* A BOOK-WIDE YTD IS ABSENT FOR THE SAME REASON ITS ROWS ARE,
                      and it is an ABSENT figure rather than an empty cell: a
                      total nobody could strike is a measurement that is missing,
                      not a column with nothing to add. */}
                  <td className="px-2 py-1.5 text-right mono whitespace-nowrap">
                    <AbsentCell reason="a year-to-date return for the book needs every holding's value on 1 January, and no statement here is dated before the year began" />
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
          {uncostedMV > 0 && (
            <p className="border-t border-dashed border-ink-700 px-2 py-2 text-[11px] leading-relaxed text-slate-500">
              Invested and Unrealised P&amp;L are struck over the {costedCount} of {heldCount} positions that report a
              cost; the other {heldCount - costedCount} are held through depository accounts that record no cost, so they
              sit in the Market value column only.
            </p>
          )}
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
            WHAT A CAGR COLUMN COVERS, counted rather than claimed. Annualising
            needs a purchase date, and the managed accounts publish a
            capital-account ledger instead of a lot register — so on this book
            the window is measurable for very few rows. A column that silently
            showed absolute figures under a "Return p.a." heading would be the
            two-bases-in-one-column failure this file keeps naming.
          */}
          {/*
            WHAT THE YTD COLUMN COVERS. Counted off the rows on screen, so a
            drop that brings a within-year purchase through the lot gate moves
            this line on its own — and a column that quietly started guessing
            would move it the wrong way.
          */}
          {(() => {
            const cov = ytdCoverage(rows, portfolio.asOf);
            if (cov.measured === cov.total) return null;
            return (
              <p className="border-t border-dashed border-ink-700 px-2 py-1.5 text-[11px] leading-relaxed text-slate-500">
                <span className="font-medium text-slate-400">YTD is the holding&rsquo;s own return this year, not the share&rsquo;s market move.</span>{" "}
                {cov.measured > 0
                  ? <>It is measurable on {cov.measured} of {cov.total} rows — the holdings opened during the year, whose whole return since purchase IS their year to date. </>
                  : <>No row can be measured on this drop. </>}
                The other {cov.absent} were already held on 1 January, and a year-to-date figure needs their value on that
                date: the earliest statement in this book is dated after the year began, so there is no opening value to
                measure from. One holdings statement per account dated on or before 1 January fills this column.
              </p>
            );
          })()}
          {returnMode === "cagr" && (() => {
            const cov = returnModeCoverage(rows, "cagr", portfolio.asOf);
            return (
              <p className="border-t border-dashed border-ink-700 px-2 py-1.5 text-[11px] leading-relaxed text-slate-500">
                <span className="font-medium text-slate-400">Annualised where a year can be measured — {cov.cagr} of {cov.total} rows.</span>{" "}
                {cov.absolute > 0 && <>{cov.absolute} {cov.absolute === 1 ? "row is" : "rows are"} held under a year and show their total return on cost, marked <span className="text-amber-400/80">abs</span>, because annualising a part-year would state a rate for a year the holding has not seen. </>}
                {cov.absent > 0 && <>{cov.absent} report no purchase date at all — the managed accounts publish a capital-account ledger rather than a lot register, so there is no window to annualise over.</>}
              </p>
            );
          })()}
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
function entityParts(ps: Position[], accIdx: AccountIndex): EntityPart[] {
  const m = new Map<string, { entity: string; quantity: number; costs: (number | null)[]; costBasis: number | null; marketValue: number; currentPrice: number | null; costUnavailable: boolean; routes: Set<string> }>();
  for (const x of ps) {
    const who = ownerOf(accIdx, x);
    const e = m.get(who) ?? { entity: who, quantity: 0, costs: [], costBasis: null, marketValue: 0, currentPrice: x.currentPrice, costUnavailable: false, routes: new Set<string>() };
    e.routes.add(ROUTE_LABEL[holdingRoute(engagementOf(accIdx, x) || null)]);
    e.quantity += x.quantity;
    // Collected and summed with sumOrNull below, not accumulated with `+=`: a
    // null cost added to a running total silently becomes NaN, and NaN formats
    // as "—" for the wrong reason on every entity that holds the name.
    e.costs.push(x.costBasis);
    e.marketValue += x.marketValue;
    if (x.costUnavailable || x.costBasis === null) e.costUnavailable = true;
    m.set(who, e);
  }
  for (const e of m.values()) e.costBasis = sumOrNull(e.costs);
  return [...m.values()].map((e) => {
    // Cost is "not meaningful" when the source flags it unavailable (even with a
    // placeholder cost) or when no cost basis is present — mirrors the By-entity view.
    const cost = e.costBasis;
    const costNA = e.costUnavailable || cost === null || (cost === 0 && e.marketValue > 0);
    const pnl = costNA ? null : e.marketValue - (cost as number);
    return {
      entity: e.entity, routes: [...e.routes], quantity: e.quantity, currentPrice: e.currentPrice,
      avgCost: !costNA && e.quantity > 0 ? (cost as number) / e.quantity : null, costBasis: cost,
      marketValue: e.marketValue, unrealizedPnL: pnl,
      returnPct: !costNA && pnl !== null && (cost as number) > 0 ? (pnl / (cost as number)) * 100 : null, costNA,
    };
  }).sort((a, b) => b.marketValue - a.marketValue);
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
const TXN_CAP = 500; // rows rendered at once; filters narrow beyond this
function TransactionsView({ selected, sector, entity, sectorByKey }: {
  selected: Set<string>; sector: string; entity: string; sectorByKey: Map<string, string>;
}) {
  const { fmtFromBase } = usePortfolio();
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [txns, setTxns] = useState<Txn[] | null>(null);
  const [meta, setMeta] = useState({ buys: 0, sells: 0 });
  const [side, setSide] = useState<"all" | "Buy" | "Sell">("all");
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
        <span className="ml-auto text-xs text-slate-500">{filtered.filter((t) => t.side === "Buy").length.toLocaleString("en-IN")} buys · {filtered.filter((t) => t.side === "Sell").length.toLocaleString("en-IN")} sells</span>
      </div>
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
                  <td className="px-3 py-2"><Pill tone={t.side === "Buy" ? "info" : "warn"}>{t.side}</Pill></td>
                  <td className="px-3 py-1.5 text-right mono text-slate-300">{fmtNum(Math.round(t.qty))}</td>
                  <td className="px-3 py-1.5 text-right mono text-slate-400">{t.price ? fmtFromBase(t.price) : <AbsentCell reason="this trade row reports no unit price on its statement" />}</td>
                  <td className="px-3 py-1.5 text-right mono text-slate-200">{t.amount ? fmtFromBase(t.amount, { compact: true }) : <AbsentCell reason="this trade row reports neither a net nor a gross amount on its statement" />}</td>
                  <td className={`px-3 py-1.5 text-right mono ${t.realized == null ? "text-slate-600" : changeColor(t.realized)}`}>{t.realized == null ? <AbsentCell reason={t.realizedNote ?? "no capital gain statement covers this account, so what this sale realised was never reported"} /> : fmtFromBase(t.realized, { compact: true, sign: true })}</td>
                  <td className="px-3 py-1.5 text-slate-400">{t.account}</td>
                </tr>
              ))}
              {shown.length === 0 && <tr><td colSpan={8} className="py-12 text-center text-sm text-slate-500">No transactions match your filters.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
