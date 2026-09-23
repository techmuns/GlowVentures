import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { Wallet, Layers, TrendingUp, Coins, Activity, Building2 } from "lucide-react";
import { Card } from "@/components/Card";
import { Pill } from "@/components/Pill";
import { Kpi } from "@/components/Kpi";
import { usePortfolio } from "@/context/PortfolioContext";
import {
  sum, sumOrNull, consolidatedMarketValue, dedupedPositions, isFundVehicle, isCompanyShare, assetClassLabel,
  measuredReturn, type RowCapital,
  holdingRoute, ROUTE_LABEL, ROUTE_NOTE,
  holdingBucket, bucketLabel, isMandateHeld, mandateLabel,
  MANDATE_BUCKET, DIRECT_EQUITY_BUCKET, UNROUTED_EQUITY_BUCKET, isCashEquivalent,
} from "@/lib/analytics";
import { fmtCurrency, fmtNum, fmtPct, fmtDate, changeColor, DASH } from "@/lib/format";
import { fifoBasisNote } from "@/lib/fifo";
import { AbsentValue, AbsentCell } from "@/components/Absent";
import { fundNavFor, isArbitrageFund } from "@/lib/fundNavs";
import { carriedCostOf, carriedCostNote } from "@/lib/tranches";
import { BOOK_POSITION_TRANCHES } from "@/data/glowData";
import type { Position } from "@/lib/types";

import { loadStockLedger, type StockLedger } from "@/lib/ledger";
import { symbolFor, symbolForKey } from "@/lib/quotes";
import { accountIndex, ownerOf, providerOf, strategyOf, engagementOf } from "@/lib/accounts";
import { ResearchPanel } from "@/components/ResearchPanel";
import { FundLookthrough } from "@/components/FundLookthrough";
import { canHaveLookthrough } from "@/lib/lookthrough";
import { ReturnsTable } from "@/components/ReturnsTable";
import { RatioTable } from "@/components/RatioTable";
import { InvestmentTools } from "@/components/InvestmentTools";
import { CompanyResearchPreview } from "@/components/CompanyResearchPreview";
import { QuantityMovement } from "@/components/QuantityMovement";
import { CorporateActionReturns } from "@/components/CorporateActionReturns";
import { PageNav } from "@/components/PageNav";
import { movementsFor, unmovedAccountsFor } from "@/lib/shareMovements";
import { SortHeader, Tr, TrFoot } from "@/components/SortHeader";
import { useTableView, sortRows } from "@/lib/tableView";
import { useStockExposure } from "@/lib/useStockExposure";
import { useViewParam, type ViewDef } from "@/components/ViewToggle";
import { TREE_ROW, TreeSectionCell } from "@/components/TreeTable";
import { ownerDisplayName } from "@/lib/owners";
import { stockHref } from "@/lib/auditFormulas";
import {
  heldThrough, heldRouteOf, measuredTotals, HELD_ROUTES, HELD_ROUTE_LABEL, HELD_ROUTE_NOTE,
  type FundLine, type HeldRoute, type MeasuredTotals,
} from "@/lib/heldThrough";
import { useDatedCapital } from "@/lib/useDatedCapital";

/**
 * THE RETURN, AND WHICH RETURN IT IS.
 *
 * *"Where will I get to see holding period return? From the date of my purchase
 * till today… Absolute return and XIRR, both. Less than one year equity has to
 * be absolute. More than one year, then you should show me CAGR."*
 *
 * The holding-period return ALWAYS renders — it is the one this book can strike
 * for every costed holding, and the family called it the most important. The
 * annual rate renders BESIDE it, never instead of it, and only where a purchase
 * date is on file and the holding is a year old: `measuredReturn` holds the
 * guard that refuses to compound a shorter window (the +99.0% failure), so a
 * row without a date shows the holding-period figure alone and the tooltip says
 * which document would supply one.
 *
 * XIRR IS A THIRD LINE ONLY WHERE THE ROW IS AN ACCOUNT. A holding inside an
 * account has no cash flows of its own — the statements cover the current
 * period — so a dash on every row of every name would say that 371 times, and
 * none is drawn. But a row that is one WHOLE folio of a fund (Buoyant's, a
 * Sanshi folio, a drawdown fund) IS that account, and the account's dated
 * record of every payment in and out is exactly what a money-weighted return is
 * solved over (`datedCapital.ts`). There it shows — **15.30% and 9.76%** on
 * Buoyant's two folios, the IRR Buoyant's own fact sheet prints — beside the
 * holding-period return, never instead of it. Under a year it does not show:
 * the guard that refuses to compound a part-year is the one in
 * `measuredReturn`, and a second line repeating the HPR would be one number
 * under two names.
 */
function ReturnCells({ p, asOf, capital }: { p: Position; asOf: string; capital?: RowCapital | null }) {
  const hpr = measuredReturn(p, "absolute", asOf);
  const cagr = measuredReturn({ ...p, capital }, "cagr", asOf);
  // Only where the guard actually annualised. `cagr` falls back to the
  // holding-period figure under a year and tags it HPR — printing that as a
  // second line would show one number twice under two names.
  const annual = cagr.shown && cagr.tag === "CAGR" ? cagr : null;
  const xirr = capital?.dated ? measuredReturn({ ...p, capital }, "xirr", asOf) : null;
  const money = xirr && xirr.shown && xirr.tag === "XIRR" ? xirr : null;
  return (
    <>
      <span className="whitespace-nowrap">
        <span className="ret-tag mr-0.5">HPR</span>
        {hpr.shown
          ? <span className={changeColor(hpr.pct)} title={hpr.note}>{fmtPct(hpr.pct, { sign: true, decimals: 1 })}</span>
          : <AbsentCell reason={hpr.reason} />}
      </span>
      {annual && (
        <div className="whitespace-nowrap">
          <span className="ret-tag mr-0.5">CAGR</span>
          <span className={changeColor(annual.pct)} title={annual.note}>{fmtPct(annual.pct, { sign: true, decimals: 1 })}</span>
        </div>
      )}
      {money && (
        <div className="whitespace-nowrap" data-stock-xirr={money.pct}>
          <span className="ret-tag mr-0.5">XIRR</span>
          <span className={changeColor(money.pct)} title={money.note}>{fmtPct(money.pct, { sign: true, decimals: 1 })}</span>
        </div>
      )}
    </>
  );
}

// Per-stock drill-down: how one security is held across the family's entities, its
// tax basis, every dated buy/sell from the ledger, and — from the muns research
// endpoints — street estimates, screener financial tables and concall documents.
/**
 * Each table's columns in DECLARED order — the order their cells are written
 * in below, which is what `<Tr>` permutes from. The first is the row's SUBJECT
 * and never moves (see `src/lib/tableView.ts`).
 */
/**
 * CMP SITS NEXT TO AVG COST, because that is the comparison a reader opens this
 * table to make — *"avg cost column has price but current NAV is not there… we
 * need a column of current NAV"*. The page had carried a holding-level mark in
 * its header since it was written and none per statement, so a holding reported
 * by several accounts showed one price above a table of several, and the ten
 * securities whose statements mark them DIFFERENTLY had no surface that could
 * say so at all. `Current` two columns along is the market VALUE, which is part
 * of why the gap was easy to miss: a reader scanning for the mark finds a
 * column called Current and it is money.
 */
const POS_COLS = ["entity", "managedBy", "qty", "avgCost", "cmp", "invested", "current", "pnl", "return", "basis"] as const;
const STOCK_TXN_COLS = ["date", "type", "entity", "qty", "rate", "amount"] as const;

/**
 * ── THE SUB-TABS ON THE POSITION TABLE — every way the family holds a company ─
 *
 *   *"I type a stock, I want to know how much I'm holding directly and how much
 *    I'm holding through managers… why should it not show me as a line item
 *    holding it through mutual fund here?"*
 *
 * One table, one tab per ROUTE, and `All` — the default — draws every route as
 * a section of the same table, so a reader sees the whole answer before they
 * touch anything. In the URL (`?held=`) like every other view in this app, so a
 * tab is a link and the page sweep reaches each one without a click. `other` is
 * offered only where a statement names a route this book does not read, which
 * is no holding today.
 */
type HeldTab = "all" | "direct" | "managers" | "funds" | "other";
const HELD_TABS: readonly ViewDef<HeldTab>[] = [
  { key: "all", label: "All" },
  { key: "direct", label: HELD_ROUTE_LABEL.direct },
  { key: "managers", label: HELD_ROUTE_LABEL.manager },
  { key: "funds", label: HELD_ROUTE_LABEL.fund },
  { key: "other", label: HELD_ROUTE_LABEL.other },
];
const TAB_ROUTE: Record<Exclude<HeldTab, "all">, HeldRoute> = {
  direct: "direct", managers: "manager", funds: "fund", other: "other",
};

/** Why each measured column is empty on a line derived from a fund's filing. */
const FUND_LINE_WHY = {
  qty: "you own units of the fund, not shares of this company — the fund's filing gives a weight, so your share of it is a value, never a count",
  cost: "you paid for units of the fund, not for these shares — the fund bought them at its own prices, so no cost exists for your share",
  cmp: "a fund's filing gives this company's weight in the fund, not a price per share for your holding",
  pnl: "no cost, so no gain can be struck on your share — the fund's own return is on the fund's page",
  basis: "no lots — the fund, not the family, bought these shares",
} as const;

export function StockInfo() {
  // Keyed by securityKey — this book's providers mostly print a name and nothing
  // else, so an ISIN route would leave most holdings unreachable.
  const { securityKey = "" } = useParams();
  const { portfolio, consolidated, fmtFromBase, convertFromBase, displayCurrency, quotesStatus } = usePortfolio();
  // Which account rows ARE a whole account on a dated record, for the XIRR line.
  const { dated: datedCap, universe: holdingsUniverse } = useDatedCapital();
  const [led, setLed] = useState<StockLedger | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    setLed(undefined);
    loadStockLedger(securityKey).then((r) => { if (alive) setLed(r); });
    return () => { alive = false; };
  }, [securityKey]);

  const rows = useMemo(() => (portfolio ? portfolio.positions.filter((p) => p.securityKey === securityKey) : []), [portfolio, securityKey]);
  // COUNT ONCE. Two of this book's securities are reported under two members
  // (360 ONE Special Opp under both CRNs, Transition Fund I under both trusts);
  // both share this securityKey, so summing the raw rows doubled this name's
  // value, quantity, cost and P&L. `dedupedPositions` collapses only the
  // dedupeGroup rows — a name held by several different accounts still sums all.
  const drows = useMemo(() => dedupedPositions(rows), [rows]);
  // Denominator for this security's weight — the whole consolidated book (each
  // dedupeGroup once). This is "% of book", not "% of listed book": the stock
  // page shows any holding, AIF units included, and those are not listed.
  const bookMV = useMemo(() => (portfolio ? consolidatedMarketValue(portfolio.positions) : 0), [portfolio]);
  const accIdx = useMemo(() => accountIndex(portfolio?.accounts ?? []), [portfolio]);
  // The demat statements' own opening-to-closing quantity account for this
  // name, one row per account that issues a transaction statement.
  const moves = useMemo(() => movementsFor(securityKey), [securityKey]);
  // Accounts that hold this name, issue a transaction statement, and print no
  // block for it — the statement saying it did not move, which a reader shown
  // nothing at all cannot tell from a gap.
  const unmoved = useMemo(() => unmovedAccountsFor(rows), [rows]);
  // ABOVE THE EARLY RETURN — a hook that runs on some renders and not others
  // is a hooks-order error rather than a conditional table.
  const posView = useTableView("stock-positions", POS_COLS);
  const txnView = useTableView("stock-txns", STOCK_TXN_COLS);
  /**
   * ── IS THIS PAGE ABOUT A COMPANY? — and the look-through it then needs ─────
   *
   * A fund's own page answers "what does this fund hold" (`FundLookthrough`
   * below); a COMPANY's page is where "which of my funds hold THIS" belongs,
   * and it is the half the family found missing. So the look-through is asked
   * for exactly where the answer can land: a company page, or an address the
   * book's statements carry no row for — which is what a company held ONLY
   * inside the family's funds looks like from here, and the Portfolio
   * Monitor's stock axis links every one of those to this route — 466 on the
   * book this was measured on. Every other page
   * (a fund folio, a cash line) never pays for the fetch.
   *
   * `useStockExposure` is the one place the look-through's three inputs are
   * assembled — the Monitor's stock axis and Sector Composition call it too —
   * so the figure this table prints for a fund is the figure those pages do.
   */
  const isCompanyPage = rows.length === 0 || !rows.every((r) => isFundVehicle(r) || r.assetClass === "Cash");
  const exposure = useStockExposure(consolidated, isCompanyPage);
  const [heldTabParam, setHeldTab] = useViewParam(HELD_TABS, {}, "held");
  if (!portfolio) return null;

  /**
   * ── A COMPANY THE FAMILY HOLDS ONLY INSIDE ITS FUNDS ───────────────────────
   *
   * No statement reports it, so there is no row — and this page read "no row"
   * as "Position closed · This name is fully exited", about a company the
   * family never held directly and still holds today through its funds. The
   * Portfolio Monitor's stock axis links every such company here, so the false
   * sentence was one click from 466 rows when this was measured.
   *
   * THREE STATES, NOT TWO. Until the look-through has answered, a page with no
   * row cannot tell a fund-held company from an exited one, and printing either
   * would be a claim made before anything was read — so it renders neither.
   */
  const fundHit = exposure.status === "ok" ? exposure.byKey.get(securityKey) : undefined;
  const noBookRows = rows.length === 0;
  const fundOnly = noBookRows && !!fundHit && fundHit.total > 0;
  const resolving = noBookRows && exposure.status === "loading";
  /* ...AND A THIRD NO-ROW CASE: the look-through did not load. Then the page
     cannot say "fully exited" either — the funds might hold it — so it says the
     one thing it knows and names what it could not check. */
  const unchecked = noBookRows && exposure.status === "unreachable";

  const name = rows[0]?.security ?? fundHit?.name ?? led?.name ?? securityKey;
  /**
   * A FUND UNIT IS NOT A COMPANY, AND THIS PAGE MUST NOT RESEARCH IT AS ONE.
   *
   * The route is `/stock/:securityKey` and it serves every holding, which is
   * right — an AIF folio's quantity, cost, entities and dated ledger all belong
   * on a page of their own. What does not belong is the five company panels
   * underneath: a returns table, a ratio table, screener's financials, concalls
   * and insider trades, each rendering its own "nothing came back" state for a
   * holding that HAS no company behind it. Five dashed boxes under a fund's name
   * read as five failed feeds, which is the "a card that can never be filled
   * must not look like one that is waiting" rule, five times over.
   *
   * This is a PERMANENT, DECIDED absence, stated once, and it is decided by the
   * asset class rather than by the ticker being null: a company whose NSE symbol
   * this book could not resolve is a resolver shortfall and keeps its panels,
   * because a future `build-symbols` fills them. A fund never will.
   *
   * CASH IS IN THE SAME SET AND `Unlisted` IS NOT. A cash line and a liquid
   * sweep have no company behind them either. An unlisted COMPANY does — it is
   * a company whose figures nobody publishes, which is a data gap the panels
   * are right to report as one, so it keeps them.
   */
  const assetClass = rows[0]?.assetClass ?? null;
  /**
   * HOW THIS NAME IS HELD, not just what it is.
   *
   * The family opened this page on Jammu Kashmir Bank, read the asset class as
   * "direct equity", and saw two lines below that Carnelian manages it. The
   * page was contradicting itself: the shares are equity — that part was never
   * wrong — but nothing said the family did not choose them.
   *
   * One name can be held both ways at once (Onesource sits in a mandate and in
   * a demat), so the routes are collected across the rows and the chip states
   * every one of them rather than the first.
   */
  const routes = useMemo(() => {
    const seen = new Map<string, number>();
    for (const r of rows) {
      const k = holdingRoute(engagementOf(accIdx, r) || null);
      seen.set(k, (seen.get(k) ?? 0) + r.marketValue);
    }
    return [...seen.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows, accIdx]);
  /**
   * WHERE THE HOLDINGS TABLES FILE THIS NAME — the same key they group on.
   *
   * The chip beside the security name used to read `assetClassLabel(assetClass)`,
   * and for a share a discretionary manager picked that is the falsehood the
   * family reported twice: a page headed "Jammu Kashmir Bank", chipped with the
   * word the holdings table reserves for shares the family chose itself, saying
   * two lines lower that Carnelian manages it. The asset class was never wrong —
   * these ARE company shares, they keep their GICS sector and their concall and
   * every exposure surface still counts them (`isCompanyShare`). What the chip
   * was doing was answering a question it had not been asked.
   *
   * `holdingBucket` is the ONE place that decides the grouping, so this chip and
   * the Portfolio Monitor's section headings cannot drift apart — a bucket
   * re-derived per screen is a bucket that disagrees with itself.
   *
   * One name can in principle be held both ways at once (none is in this drop),
   * so the buckets are collected ACROSS the rows and every one is chipped rather
   * than the first row's speaking for all of them.
   */
  const buckets = useMemo(() => {
    const seen = new Map<string, number>();
    for (const r of rows) {
      const k = holdingBucket(r, engagementOf(accIdx, r) || null);
      seen.set(k, (seen.get(k) ?? 0) + r.marketValue);
    }
    return [...seen.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows, accIdx]);
  /**
   * THE MANDATES THIS NAME SITS INSIDE, for the line above the fold and the
   * link on each row.
   *
   * A reader who lands on a company page from a search has no way to discover
   * that the position is one of thirty-odd a manager runs on the family's
   * behalf, and no way to reach the other twenty-nine — which is precisely what
   * the family asked for. The account IS the mandate (`/mandate/:accountId`):
   * two managers here run one strategy for two members, so each has its own
   * as-of, its own statement total and its own page.
   */
  const mandates = useMemo(() => rows
    .filter((r) => isMandateHeld(engagementOf(accIdx, r) || null))
    .map((r) => ({
      accountId: r.accountId,
      // Strategy where the manager prints one, else the provider — one helper,
      // so this link is labelled exactly as the mandate page titles itself.
      label: mandateLabel(accIdx.get(r.accountId)),
      provider: providerOf(accIdx, r),
      owner: ownerOf(accIdx, r),
      mv: r.marketValue,
    }))
    .sort((a, b) => b.mv - a.mv), [rows, accIdx]);
  /**
   * WHAT THE MANDATE ROWS ACTUALLY ARE — because the line above the fold and the
   * mandate chip's tooltip each name a NOUN, and a typed noun is a claim.
   *
   * `holdingBucket` puts a mandate's WHOLE account in the mandate bucket, cash
   * sleeve included, and that is deliberate: the mandate is worth what its own
   * statement says it is worth. So 18 of this book's mandate-held rows are not
   * shares at all — ₹9.51 Cr of `Cash` across the ten mandates, plus Cash
   * Rec/Payable, a liquid sweep and a TDS receivable — and the mandate page
   * links every one of them to `/stock/<securityKey>`. Arriving here from that
   * link, a hardcoded "the family owns these shares" describes a ₹9.51 Cr
   * balance as shares, on the same screen whose research card says in as many
   * words that this holding is a balance and not a share in a company. Two
   * contradictory claims about one figure, and the false one is the specific
   * one a reader believes.
   *
   * So the noun is DERIVED from the rows the sentence actually covers — the
   * mandate-held subset, not the page's first row and not its asset class,
   * because one name could in principle be a share in one account and something
   * else in another and the sentence speaks only for the mandates.
   */
  const mandateRows = useMemo(
    () => rows.filter((r) => isMandateHeld(engagementOf(accIdx, r) || null)),
    [rows, accIdx]);
  const mandateAllShares = mandateRows.length > 0 && mandateRows.every(isCompanyShare);
  const mandateNoShares = mandateRows.length > 0 && !mandateRows.some(isCompanyShare);
  /** Where none of them is a share and they are all ONE class, the sentence can
   *  name that class instead of reaching for a generic noun. Mixed classes fall
   *  back to the neutral wording rather than picking one to speak for the rest. */
  const mandateClass = mandateNoShares && new Set(mandateRows.map((r) => r.assetClass)).size === 1
    ? assetClassLabel(mandateRows[0].assetClass)
    : null;
  /** The mandate bucket's tooltip, on the same derivation and for the same
   *  reason: "Company shares, held under a discretionary mandate" is true of
   *  Jammu & Kashmir Bank and false of the cash sleeve sitting in the same
   *  bucket by design. */
  const mandateBucketTip = mandateAllShares
    ? "Company shares, held under a discretionary mandate. The holdings tables file them under the manager who chose them, not with the shares the family bought itself."
    : mandateNoShares
      ? `${mandateClass ?? "Not a company share"} — held inside a discretionary mandate. The holdings tables file a mandate's WHOLE account under its manager, the balances beside the shares included, so the mandate's total ties to the statement it came from. That is why this sits under ${MANDATE_BUCKET} rather than under its own class.`
      : `Held inside a discretionary mandate. The holdings tables file a mandate's whole account under its manager — the shares it holds and the balances beside them — rather than splitting one statement across classes.`;
  /** What one unit of this holding IS, for the Quantity tile's caption. */
  const qtyNoun = assetClass === "Cash" ? "balance"
    : assetClass === "Equity" || assetClass === "Unlisted" ? "shares held"
    : assetClass ? "units held"
    : "held";
  const notACompany = rows.length > 0 && rows.every((r) => isFundVehicle(r) || r.assetClass === "Cash");
  const fundVehicle = rows.length > 0 && rows.every(isFundVehicle);
  const NOT_A_COMPANY_LABEL: Record<string, string> = {
    "Mutual Fund": "a mutual fund", ETF: "an ETF", AIF: "an AIF folio", Cash: "a cash line",
  };
  /**
   * A LIQUID OR ARBITRAGE FUND IS CASH ON THIS PAGE TOO. The family's rule is
   * that such a fund is classified as nothing but cash, so the sentence below
   * says Cash rather than the wrapper its statement typed it as — and an
   * arbitrage fund is not looked through at all: its disclosed long shares are
   * hedged by short futures, and reading them as exposure would print stock the
   * family does not carry.
   */
  const cashFund = fundVehicle && rows.every((r) => isCashEquivalent(r));
  const arbitrage = rows.some((r) => isArbitrageFund(r));
  // A fund-held company carries the sector its funds' filings agree on, which
  // is a third party's reading and only ever fills an absence (`companyExposure`).
  const sector = rows[0]?.sector ?? (fundOnly ? fundHit?.sector ?? undefined : undefined);
  const providerSector = rows[0]?.providerSector;
  const isin = rows[0]?.isin ?? (fundOnly ? fundHit?.isin ?? undefined : undefined);
  /* The holding-level mark is resolved below, once `price` exists — whether
     one can be shown at all is a question about what the RENDERER can
     distinguish, so it cannot be answered before the renderer is defined. */
  const qty = sum(drows.map((r) => r.quantity));
  const cost = sumOrNull(drows.map((r) => r.costBasis));
  const mv = sum(drows.map((r) => r.marketValue));
  const pnl = sumOrNull(drows.map((r) => r.unrealizedPnL));
  // Both stay NULL when no statement reported a cost for this name, so the
  // tiles render `—`. A zero average cost reads as shares acquired for nothing
  // and a zero return as break-even; neither was measured.
  // The table's rows are drawn per ROUTE now — see `sortedPositions` below,
  // where the default ranking (largest first) and a reader's own both live.
  /**
   * COST OVER THE UNITS THAT HAVE ONE — `measuredTotals` says why at length. It
   * was `cost ÷ qty` over every row, and ICICI Bank read an average cost of
   * ₹438.34 for a share trading near ₹1,400: ₹94.2 L of cost on the 7,000
   * shares two PMS statements report, divided by 21,500 shares of which 14,500
   * sit in a demat that reports none. The tiles say which units the figure is
   * struck over wherever that is not all of them.
   */
  const whole = measuredTotals(rows);
  const avgCost = whole.avgCost;
  /**
   * FIFO — the realised gain on units of this holding already sold stays in
   * its return (`fifoTotals`), over the rows that report a cost, which is the
   * set Invested beside it is struck on. `measuredTotals` strikes it, so the
   * tiles above and every footer below share one figure.
   */
  const fifo = whole.fifo;
  const ret = whole.costedReturn;
  /** "7,000 of 21,500 shares" — only where a cost covers some units and not all. */
  const costedShare = cost !== null && whole.costedQty > 0 && whole.costedQty < qty - 1e-6
    ? `${fmtNum(whole.costedQty)} of ${fmtNum(qty)} ${assetClass === "Equity" ? "shares" : "units"}`
    : null;
  /**
   * WHY THERE IS NO COST — the question the reader actually opened this page with.
   *
   * `costBasis` is null on 60 of this book's 371 positions and every one of them
   * is genuinely absent at source: measured across the whole audit archive, NOT
   * ONE of those (account, security) pairs carries a cost on any record type —
   * a depository reports what shares are worth, never what they were bought for.
   * So the dash is right and the page was still wrong, because it said nothing:
   * Avg cost printed "invested —", which is a SECOND DASH rather than a reason,
   * and Unrealised P&L printed "on cost" over a holding that has no cost, which
   * describes a basis the figure does not have.
   *
   * Two tiles on the same strip already do this properly ("no capital gain
   * statement covers this name", "no live quote"), and the difference is the
   * whole of `Absent.tsx`'s rule: a reason is a REQUIRED argument, because "no
   * data" tells a reader nothing about whether to go and find something. A
   * reader who cannot tell "the custodian does not send this" from "the
   * dashboard is broken" will assume the second.
   *
   * The custodian is NAMED rather than described, and the claim is scoped to
   * THIS holding — `providerOf` reads the account registry, so nothing here
   * infers a custodian from a security name (§2), and the sentence stays true
   * for an account that reports cost on its other rows but not this one.
   */
  const costWhy = (() => {
    const who = [...new Set(drows.map((r) => providerOf(accIdx, r)).filter(Boolean))];
    if (who.length === 1) return `no cost on the ${who[0]} statement for this holding`;
    if (who.length > 1) return "no statement for this holding reports a cost";
    return "no statement in this book reports a cost for this holding";
  })();
  const weight = bookMV > 0 ? (mv / bookMV) * 100 : 0;
  // Null, not zero, when no statement supplied the figure — see sumOrNull.
  const stCost = sumOrNull(drows.map((r) => r.stCostBasis));
  const ltCost = sumOrNull(drows.map((r) => r.ltCostBasis));
  const div = sumOrNull(drows.map((r) => r.dividendReceived));
  // Live-quote state for this name. Every lot shares one quote, so this is
  // all-or-nothing in practice; the day move is summed across the lots.
  /* A page with no row still has an address, and the symbol map is keyed on
     it — so a company the book once held, or one only a fund holds, keeps its
     symbol where `build-symbols` resolved one rather than losing it with the
     row. Reading `rows[0]` alone made every such page claim "no NSE symbol". */
  const sym = rows[0] ? symbolFor(rows[0]) : symbolForKey(securityKey);
  /* Every research panel below is keyed on that symbol. On a no-row page
     without one they would each render "no NSE symbol" — about a company the
     family holds through its funds, or before the look-through has even said
     whether it does. So they wait while it resolves, and a funds-only company
     gets ONE sentence saying why instead of four empty panels. */
  const researchHeld = noBookRows && !sym && (fundOnly || resolving);
  const researchAbsent = fundOnly && !sym;
  const live = drows.length > 0 && drows.every((r) => r.live);
  const dayPct = live ? rows[0]?.dayChangePct ?? null : null;
  const dayChange = sum(drows.map((r) => r.dayChange ?? 0));
  /**
   * PER-OWNER, SO THE RAW ROWS. This counted `drows` and reported "Held in 1
   * entity" for 360 ONE Special Opportunities — a holding reported on Ajay's
   * CRN37702 and Bharat's CRN60117, whose own "Position by account" table two
   * cards below listed both of them. The pill and the table contradicted each
   * other on one screen.
   *
   * It is the §"consolidated counts once, per-account does not" rule: the
   * CONSOLIDATED value below is right to dedupe, and a count of the entities
   * that report this name is not a consolidated figure — it is the answer to
   * "whose statements is this on", and the answer is two.
   */
  const held = new Set(rows.map((r) => r.accountId)).size;
  // NO ROW IS NOT THE SAME AS EXITED — see `fundOnly` above.
  const exited = held === 0 && !fundOnly && !resolving;
  /**
   * What the account rows carry that the (consolidated) footer beneath them does
   * not. Non-zero only where this name is reported under more than one member,
   * and named under the table so a reader who adds the rows and gets a bigger
   * number than the Total can see why. Derived from the two sets, never typed.
   */
  const dupCollapsed = sum(rows.map((r) => r.marketValue)) - sum(drows.map((r) => r.marketValue));

  const price = (n: number | null | undefined) =>
    (typeof n === "number" && Number.isFinite(n) ? fmtCurrency(convertFromBase(n), displayCurrency) : "—");
  const money = (n: number | null | undefined, sign?: boolean) => fmtFromBase(n, { compact: true, sign });
  /**
   * A COST CARRIED THROUGH A FUND'S CLASS SWITCH, and the figure the fund's own
   * statement prints instead. This is the page a reader opens with that
   * statement in hand, so the two must be told apart here in the same words the
   * Portfolio Monitor uses — `carriedCostNote` is the one place they are chosen.
   */
  const carried = cost === null ? null : carriedCostOf(drows, BOOK_POSITION_TRANCHES);
  const carriedWhy = carried ? carriedCostNote(carried, (v) => money(v)) : "";

  /**
   * THE MARK, AND WHY IT IS NOT `rows[0]`.
   *
   * NULL, NOT ZERO, first: this read `?? 0` and printed a 2xl "₹0" as the CMP
   * headline of every holding its statement marks at a TOTAL VALUE rather than
   * a per-unit price — 360 ONE's AIF units among them, whose page therefore led
   * with a zero price above a ₹1.47 Cr holding value. A figure produced by a
   * default is the exact failure this book exists to prevent.
   *
   * IT THEN READ `rows[0]?.currentPrice`, WHICH IS A DIFFERENT FABRICATION AND A
   * QUIETER ONE. A holding reported by several statements has several marks, and
   * they are not always the same figure — measured over this book, 10 of its 213
   * securities carry marks that render DIFFERENTLY, and the spread is not small:
   *
   *     Gland Pharma      ₹2,667.30 (Carnelian, 10 Aug)  ₹2,502.90 (SVAN, 31 Jul)
   *     DSP Gold ETF      ₹151.10 on ₹3.1 Cr            ₹141.24 on ₹16.9 Cr
   *     HELIOS FCF D-GROW ₹14.18                        ₹15.74
   *
   * Printing the first ARRAY ELEMENT as the holding's price is a real number
   * belonging to one statement, standing over a page whose every other figure
   * covers all of them — and `rows` is unsorted, so on DSP Gold it printed the
   * mark of the row holding 15% of the position. The first pair is ordinary and
   * is §3 working as designed: two statements drawn ten days apart. The other
   * two are NOT — same provider, same ISIN, same 31 July as-of, two rates —
   * which is the extractor join `docs/BOOK-REPORT.md` already names, refined by
   * this measurement: the dates agree, so the date does not explain them.
   *
   * So the page does not choose. Where every statement's mark renders as ONE
   * figure it is shown; where they do not, the holding-level cell states that
   * and sends the reader to the per-account table, which prints each mark
   * beside the statement it came from. **The test is what the RENDERER can
   * distinguish**, not an invented tolerance: two marks the page would print
   * identically are one figure as far as a reader is concerned, and two it
   * prints differently are genuinely two.
   */
  /**
   * THE PUBLISHED NAV BEHIND THIS HOLDING, where one priced it. Read for the
   * CAPTION only — the figure itself already flows through `currentPrice`,
   * which `applyFundNavs` overlaid at the context. Reading it again to compute
   * a value would be a second source for one number.
   */
  const navMark = rows.some((r) => r.navPriced) ? fundNavFor({ securityKey }) : null;
  const cmpMarks = [...new Set(rows.map((r) => r.currentPrice)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v))
    .map(price))];
  const cmpSplit = cmpMarks.length > 1;
  const cmp = cmpMarks.length === 1 ? cmpMarks[0] : null;
  /** The distinct statement dates behind a split mark, for the reason line. */
  const cmpDates = [...new Set(rows.filter((r) => r.currentPrice != null)
    .map((r) => accIdx.get(r.accountId)?.asOf).filter(Boolean) as string[])].sort();
  const buys = (led?.txns ?? []).filter((t) => t.side === "Buy");
  const firstBought = buys.length ? buys[buys.length - 1].date : null;
  const lastAdded = buys.length ? buys[0].date : null;
  // Null when the long-term cost is unknown — the bar is hidden rather than
  // drawn at zero, which would read as "none of this is long-term".
  const ltPct = ltCost !== null && cost !== null && cost > 0 ? (ltCost / cost) * 100 : null;

  /**
   * ── THE POSITION TABLE, BY ROUTE ───────────────────────────────────────────
   *
   * `heldThrough` splits the statement rows by the route their account takes
   * (`holdingRoute`, the one place that decides it) and adds a line per member
   * for every fund that discloses this company. The page draws; the model is
   * the suite's to check (`heldThrough.test.ts`).
   */
  const ht = heldThrough(securityKey, rows, (p) => holdingRoute(engagementOf(accIdx, p) || null), portfolio.positions, exposure);
  const fl = ht.fundLines;
  // A fund folio or a cash line keeps its one table: "which of my funds hold
  // this" has no meaning for a fund, and its rows are all the same route.
  const tabsShown = isCompanyPage;
  const heldTab: HeldTab = !tabsShown ? "all"
    : heldTabParam === "other" && ht.sections.other.lines === 0 ? "all" : heldTabParam;
  const ownerOfAccount = (accountId: string) => {
    const a = accIdx.get(accountId);
    if (!a) return "Unattributed";
    return a.ownerId ? ownerDisplayName(a.ownerId) : a.owner || "Unattributed";
  };
  const posAccessors = {
    entity: (r: Position) => ownerOf(accIdx, r),
    managedBy: (r: Position) => providerOf(accIdx, r),
    qty: (r: Position) => r.quantity,
    avgCost: (r: Position) => r.avgCost,
    // The statement's own mark, never `marketValue / quantity`: measured over
    // this book the two differ on ICICI NFT NT 50 DP G, whose statement prints
    // a rate of 60.4 against a value column implying 60.4167. The price is a
    // PRIMITIVE here (§4b) and deriving it would publish a figure the document
    // does not. An absent mark sorts LAST either way rather than as a zero.
    cmp: (r: Position) => r.currentPrice,
    invested: (r: Position) => r.costBasis,
    current: (r: Position) => r.marketValue,
    pnl: (r: Position) => r.unrealizedPnL,
    return: (r: Position) => r.returnPct,
    basis: (r: Position) => (r.stCostBasis === null && r.ltCostBasis === null ? null : (r.ltCostBasis ?? 0) >= (r.stCostBasis ?? 0) ? "LT" : "ST"),
  };
  /** Largest first is the default, and a reader's ranking replaces it WITHIN a
   *  route — a section is a partition of the table, so ranking across routes
   *  would put a derived line between two of a manager's rows. */
  const sortedPositions = (ps: Position[]) =>
    sortRows([...ps].sort((a, b) => b.marketValue - a.marketValue), posView.sort, posAccessors);
  /** A fund line has a holder, a fund and a derived value — every other column
   *  is absent on it, so it sorts LAST on those rather than as a zero. */
  const sortedFunds = (ls: FundLine[]) => sortRows(ls, posView.sort, {
    entity: (l: FundLine) => ownerOfAccount(l.accountId),
    managedBy: (l: FundLine) => l.fundName,
    qty: () => null, avgCost: () => null, cmp: () => null, invested: () => null,
    current: (l: FundLine) => l.value,
    pnl: () => null, return: () => null, basis: () => null,
  });

  /** One statement row, as the table has always drawn it. */
  const measuredRow = (r: Position) => {
    const eng = engagementOf(accIdx, r) || null;
    const route = holdingRoute(eng);
    // The account's dated capital where this row IS the whole account — the
    // XIRR line's only source; undefined on a holding inside one.
    const rowCap = datedCap?.behind([r], holdingsUniverse) ?? undefined;
    return (
      /* COUNTED STRUCTURALLY, NEVER BY LINE. `check:pages` used to
         count these rows by splitting the table's innerText on
         newlines, which works only while every cell is one line —
         and the MANAGED BY cell below carries a strategy sub-line
         whenever the account prints one. The entity-count check
         therefore passed on a dually-reported holding whose
         accounts name no strategy and failed on one that does,
         which is a fact about the fixture rather than the page. */
      <Tr view={posView} key={r.accountId} data-account-row={r.accountId} data-held-route={heldRouteOf(route)} className="hover:bg-ink-700/40">
        <td className="px-4 py-2.5 font-medium text-slate-100">{ownerOf(accIdx, r)}</td>
        {/* THE WIDEST TEXT IN THE TABLE MAY WRAP; A FIGURE MAY NOT. A
            provider's legal name runs to forty-odd characters and this
            column is sized by its widest unbreakable cell, so with every cell
            on one line a name held through a demat, a mandate and a fund
            pushed Return and Basis past the card's right edge — the sideways
            scroll Stage 10ba measured and removed. It wraps inside the same
            12rem floor the fund lines below it already keep. */}
        <td className="whitespace-normal px-4 py-2.5 text-[12px] text-slate-400">
          <div className="min-w-[12rem]">
          <div>{providerOf(accIdx, r)}</div>
          {/* The route reads as a phrase — "via manager's mandate"
              — because the column header no longer supplies the
              word. `ROUTE_LABEL` is unchanged and is still the one
              place those four words are chosen. */}
          <div className="text-[10px] text-slate-600" data-held-via>
            {strategyOf(accIdx, r) && !isMandateHeld(eng) && <>{strategyOf(accIdx, r)}{" · "}</>}
            <span title={`${eng || "engagement not stated"} — ${ROUTE_NOTE[route]}`}>
              via {ROUTE_LABEL[route]}
            </span>
          {/* THE ROW IS THE DOOR INTO THE MANDATE. A reader who
              arrived on this name has one question left — what
              else is in there — and this is the only place on the
              page that can answer it per account, which matters
              where one name is held under two different mandates.
              Labelled with the strategy the manager prints, or the
              manager itself where none is printed. */}
          {isMandateHeld(eng) && (
            <>
              {" · "}
              <Link to={`/mandate/${encodeURIComponent(r.accountId)}`} className="text-champagne-400 hover:underline"
                title="Open this mandate — every holding the manager runs in it, tied to the statement it came from">
                {mandateLabel(accIdx.get(r.accountId))}
              </Link>
            </>
          )}
          </div>
          </div>
        </td>
        <td className="px-4 py-2.5 text-right mono text-slate-300">{fmtNum(r.quantity)}</td>
        <td className="px-4 py-2.5 text-right mono text-slate-400">{r.avgCost === null ? <AbsentCell reason="this provider prints no per-unit cost for the holding" /> : price(r.avgCost)}</td>
        {/* THE MARK, PER STATEMENT, WITH THE DATE IT WAS STRUCK.
            The date is the cell's own hover rather than a second
            column: it is what makes two rows of one name carrying
            two prices readable rather than alarming, and on the
            203 holdings whose statements agree it is one more
            column of noise. Guarded before `price()`, which
            returns a BARE dash — an absence names its cause. */}
        <td className="px-4 py-2.5 text-right mono text-slate-400" data-cmp={r.currentPrice ?? ""}>
          {r.currentPrice === null
            ? <AbsentCell reason="this statement reports the holding at a total value, not a price per unit, so there is no mark to show" />
            : <span title={r.depositoryUnits
                /* NO STATEMENT MARKS THESE UNITS, so the sentence that
                   says a NAV "replaces" one would be false here. */
                ? `${price(r.currentPrice)} — AMFI's published NAV for this scheme as of ${r.navDate}. No statement prices these units: they are the depository's own closing balance of ${r.depositoryUnits.asOf ?? "its statement date"} on an account that sent a transaction statement and no holding statement, and their value is those units at this NAV.`
                : r.navPriced
                ? `${price(r.currentPrice)} — AMFI's published NAV for this scheme as of ${r.navDate}, which is newer than the ${providerOf(accIdx, r)} statement's own mark and replaces it. Only the value moves: quantity, cost and every dated figure stay as the statement printed them.`
                : `Marked at ${price(r.currentPrice)} by the ${providerOf(accIdx, r)} statement${accIdx.get(r.accountId)?.asOf ? ` of ${accIdx.get(r.accountId)!.asOf}` : ""}.`}>
                {price(r.currentPrice)}
              </span>}
        </td>
        <td className="px-4 py-2.5 text-right mono text-slate-400"
          data-cost-carried={r.costBasisSource === "carried-through-switch" ? (r.costBasis ?? undefined) : undefined}
          data-cost-printed={r.costBasisSource === "carried-through-switch" ? r.printedCostBasis : undefined}>
          {r.costBasisSource === "carried-through-switch"
            ? <span title={carriedCostNote(carriedCostOf([r], BOOK_POSITION_TRANCHES)!, (v) => money(v))}>{money(r.costBasis)}</span>
            : money(r.costBasis)}
        </td>
        <td className="px-4 py-2.5 text-right mono text-slate-200">{money(r.marketValue)}</td>
        <td className={`px-4 py-2.5 text-right mono ${changeColor(r.unrealizedPnL)}`}>{money(r.unrealizedPnL, true)}</td>
        {/*
          *"Where will I get to see holding period return? From the
          date of my purchase till today. Where is it — that's the
          most important return… Absolute return and XIRR, both."*
          So the cell states WHICH return it is rather than leaving
          a bare percentage to be read as whichever the reader has
          in mind, and where a purchase date licenses an annual
          rate it shows that BESIDE the holding-period figure
          instead of replacing it. `measuredReturn` is the one
          place the methodology lives (Stage 10af) — the guard that
          refuses to compound a sub-year window onto a year is
          inside it, and is not re-implemented here.
        */}
        <td className="px-4 py-2.5 text-right mono" data-stock-return
          data-capital={rowCap ? (rowCap.dated ? "dated" : "undated") : undefined}>
          <ReturnCells p={r} asOf={portfolio.asOf} capital={rowCap} />
        </td>
        <td className="px-4 py-2.5 text-right">
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${(r.ltCostBasis ?? 0) >= (r.stCostBasis ?? 0) ? "bg-emerald-500/15 text-gain" : "bg-amber-500/15 text-amber-400"}`}>{r.stCostBasis === null && r.ltCostBasis === null ? DASH : (r.ltCostBasis ?? 0) >= (r.stCostBasis ?? 0) ? "LT" : "ST"}</span>
        </td>
      </Tr>
    );
  };

  /**
   * ONE MEMBER'S SHARE OF THIS COMPANY THROUGH ONE FUND — a LINE ITEM, which is
   * what the family asked for, and DERIVED, which is what it is.
   *
   * It says "derived" IN WORDS on the row, not in a tooltip (the rule this book
   * set for the stock axis), because in the All tab it sits under the same
   * Current heading as a figure a statement printed. The arithmetic behind it
   * — this member's holding of the fund, the fund's own disclosed weight, and
   * the product — is the hover on both the route and the value.
   *
   * No `data-account-row` and no `data-cmp`: those handles mean "a statement
   * row" and "the mark a statement printed", and this line is neither.
   */
  const fundRow = (l: FundLine) => {
    const owner = l.accountId ? ownerOfAccount(l.accountId) : "Holder not recorded";
    const provider = accIdx.get(l.accountId)?.provider ?? null;
    const vehicle = l.vehicleClass === "ETF" ? "ETF" : "mutual fund";
    const weight = `${l.pctAum.toFixed(2)}%`;
    const held = l.classes.length ? ` (held as ${l.classes.join(" and ")})` : "";
    const many = l.instruments.length > 1 ? ` across ${l.instruments.length} instruments` : "";
    /* WHAT THE FUND HOLDS OF IT, IN WORDS ON THE LINE. A liquid fund holding a
       bank's certificates of deposit and a flexi-cap fund holding its shares are
       both "exposure to the bank", and only one of them is a share a reader
       could compare with the demat row above. Read off the filing's own class
       per instrument (`FundLine.classes`), never assumed to be equity. */
    const heldAs = [l.classes.includes("Equity") && "shares", l.classes.includes("Debt") && "debt",
      l.classes.includes("Other") && "other"].filter(Boolean).join(" + ") || null;
    const owns = heldAs === "shares" ? "the shares" : heldAs === "debt" ? "the debt" : "the securities";
    const math = `${provider ? `The ${provider} statement` : "The book"} values ${owner}'s holding of ${l.fundName} at ${money(l.fundValue)}. `
      + `The fund's own filing${l.holdingsAsOf ? ` of ${l.holdingsAsOf}` : ""} puts ${weight} of the fund in ${name}${many}${held}, `
      + `so ${owner}'s share is ${money(l.fundValue)} × ${weight} = ${money(l.value)}. `
      + `DERIVED, not a position: the family owns units of the fund and the fund owns ${owns}. It is no part of the book's own value — the fund's own value already stands for it there.`;
    return (
      <Tr view={posView} key={l.key} data-fund-line={l.fundKey} data-fund-line-account={l.accountId}
        data-fund-line-value={l.value} data-fund-line-pct={l.pctAum} data-fund-line-holding={l.fundValue}
        className="hover:bg-ink-700/40">
        <td className="px-4 py-2.5 font-medium text-slate-100">{owner}</td>
        {/* A FUND'S NAME MAY WRAP; A PROVIDER'S DOES NOT NEED TO. Scheme names
            run to fifty-odd characters ("Aditya Birla Sun Life Balanced
            Advantage Fund · Regular") and this column is sized by its widest
            unbreakable cell, so the fund line wraps inside the width the
            statement rows already give it rather than widening the table. */}
        <td className="whitespace-normal px-4 py-2.5 text-[12px] text-slate-400">
          <div className="min-w-[12rem]">
            <Link to={stockHref(l.fundKey)} className="transition-colors hover:text-champagne-400"
              title={`Open ${l.fundName} — what the fund holds, and what the family holds of it`}>{l.fundName}</Link>
          </div>
          <div className="text-[10px] text-slate-600">
            <span title={math}>via {vehicle} · <span className="text-champagne-400/80">derived</span>
              {heldAs && <> · <span data-fund-line-held={heldAs}>{heldAs}</span></>} · {weight} of the fund</span>
          </div>
        </td>
        <td className="px-4 py-2.5 text-right mono text-slate-400"><AbsentCell reason={FUND_LINE_WHY.qty} /></td>
        <td className="px-4 py-2.5 text-right mono text-slate-400"><AbsentCell reason={FUND_LINE_WHY.cost} /></td>
        <td className="px-4 py-2.5 text-right mono text-slate-400"><AbsentCell reason={FUND_LINE_WHY.cmp} /></td>
        <td className="px-4 py-2.5 text-right mono text-slate-400"><AbsentCell reason={FUND_LINE_WHY.cost} /></td>
        <td className="px-4 py-2.5 text-right mono text-slate-200"><span title={math}>{money(l.value)}</span></td>
        <td className="px-4 py-2.5 text-right mono text-slate-400"><AbsentCell reason={FUND_LINE_WHY.pnl} /></td>
        <td className="px-4 py-2.5 text-right mono text-slate-400"><AbsentCell reason={FUND_LINE_WHY.pnl} /></td>
        <td className="px-4 py-2.5 text-right"><AbsentCell reason={FUND_LINE_WHY.basis} /></td>
      </Tr>
    );
  };

  /**
   * A ROUTE'S BAND — its name, what kind of figure it carries, and its own
   * total UNDER THE COLUMN IT TOTALS, through `<Tr view>` so the total follows
   * a dragged column (the `TreeTable` standard). Only the All tab draws bands;
   * a single-route tab is already one section and says so on its tab.
   */
  const routeBand = (route: HeldRoute, value: number | null, sub: string) => (
    /* THE LABEL IS SHORT ON PURPOSE. The band's first cell sits in the Entity
       column, and a table sizes a column to its widest cell — "INSIDE YOUR
       MUTUAL FUNDS" and a wrapped sub-line under it widened that column by a
       hundred pixels and pushed Return and Basis off the card's right edge, the
       exact sideways scroll Stage 10ba measured and removed. So the band says
       the route in the tab's own words and carries its counts in its hover. */
    <Tr view={posView} key={`band-${route}`} className={TREE_ROW.section} data-held-band={route}
      data-held-band-value={value ?? ""} title={`${HELD_ROUTE_NOTE[route]} ${sub}`}>
      <TreeSectionCell title={HELD_ROUTE_LABEL[route]}
        marker={route === "fund"
          ? <span className="rounded border border-champagne-500/30 px-1.5 py-px text-[9.5px] font-semibold uppercase tracking-wider text-champagne-400/90">derived</span>
          : undefined} />
      <td /><td /><td /><td /><td />
      <td className="px-4 py-2 text-right mono text-[12.5px] font-semibold text-slate-200">
        {value === null ? <AbsentCell reason="the fund look-through has not answered" /> : money(value)}
      </td>
      <td /><td /><td />
    </Tr>
  );

  /** The fund route's absences and coverage, NAMED — never inferred from a row that is not there. */
  const fundNote = () => {
    if (fl.status !== "ok") return null;
    const aifValue = sum(fl.aif.map((s) => s.marketValue));
    return (
      <tr key="fund-note" data-held-fund-note>
        <td colSpan={posView.order.length} className="whitespace-normal px-4 py-2 text-[11px] leading-relaxed text-slate-500">
          {fl.lines.length === 0
            ? <>None of the {fl.covered} fund holdings this book can read discloses {name}. </>
            : <>Read across {fl.covered} of your {fl.considered} fund holdings, on each fund&rsquo;s whole monthly filing. </>}
          {fl.aif.length > 0 && <span data-held-aif={fl.aif.length}>Your {fl.aif.length} AIF holding{fl.aif.length === 1 ? "" : "s"} ({money(aifValue)}) file
            no portfolio this book can join, so whether they hold it is not known. </span>}
          {fl.unread.length > 0 && <>{fl.unread.length} other fund{fl.unread.length === 1 ? "" : "s"} could not be read: {fl.unread.map((s) => s.fundName).join(", ")}.</>}
        </td>
      </tr>
    );
  };

  /** A route a reader picked that holds nothing — an answer, not an empty frame. */
  const emptyRoute = (route: HeldRoute) => (
    <tr key={`empty-${route}`} data-held-empty={route}>
      <td colSpan={posView.order.length} className="whitespace-normal px-4 py-4 text-center text-[12.5px] text-slate-400">
        {route === "fund"
          ? fl.status === "loading" ? "Reading your funds' monthly filings…"
            : fl.status === "unreachable" ? "The fund look-through did not answer, so it is not known whether your funds hold this — a fact about the fetch, not about the holding."
            : `None of the funds this book can read discloses ${name}.`
          : route === "direct" ? `The family holds none of ${name} in its own demat or broking accounts — no such statement reports it.`
          : route === "manager" ? `No PMS manager holds ${name} for the family — no mandate statement reports it.`
          : "No other account reports it."}
      </td>
    </tr>
  );

  /**
   * ── THE FOOTER FOR A SET OF STATEMENT ROWS ─────────────────────────────────
   *
   * Every figure over exactly the rows above it — the whole book's rows on the
   * All tab, one route's on its own tab — so a total always ties to its own
   * column (§"a total must tie to its own columns").
   *
   * A BLENDED AVG COST IS ARITHMETIC; A BLENDED MARK IS AN INVENTION. The avg
   * cost is cost over the units that HAVE one (`measuredTotals`), and both of
   * those add across statements. Prices do not: a quantity-weighted mean of
   * ₹2,667.30 and ₹2,502.90 is a price no document struck, so the mark is shown
   * where every statement in the set agrees on one and refused where they do
   * not — the same resolution the headline uses.
   *
   * AND THE RETURN ONLY WHERE THE COST COVERS THE SET (`costCoversSet`, the rule
   * Morning CIO and the Portfolio Monitor share). ICICI Bank's three rows read
   * ₹94.2 L invested against ₹2.88 Cr current with −0.5% beside them: the −0.5%
   * is the two PMS rows' return and describes neither column. Each account's
   * own return is on its row, and the PMS managers tab — whose rows are all
   * costed — carries its total.
   */
  const measuredFoot = (ps: Position[], label: ReactNode, key: string) => {
    const t = measuredTotals(ps);
    const marks = [...new Set(ps.map((r) => r.currentPrice)
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v)).map(price))];
    const unitNoun = ps.every(isCompanyShare) ? "shares" : "units";
    const partial = t.cost !== null && t.costedQty < t.qty - 1e-6;
    const noCostWhy = (() => {
      const who = [...new Set(ps.map((r) => providerOf(accIdx, r)).filter(Boolean))];
      return who.length === 1 ? `no cost on the ${who[0]} statement for these rows` : "no statement for these rows reports a cost";
    })();
    return (
      <TrFoot view={posView} key={key} className="px-4 py-2.5 text-left text-slate-200"
        data-held-foot="measured" data-held-foot-value={t.mv}
        /* A TOTAL MUST TIE TO ITS OWN COLUMNS, and this one cannot by
           subtraction where only some units report a cost: Invested and P&L are
           over those units while Current is over all of them. Said on the row,
           in words a reader sees, rather than only in three hovers. */
        label={partial
          ? <>{label}<div className="max-w-[22rem] whitespace-normal text-[10.5px] font-normal leading-snug text-slate-500"
              data-held-foot-coverage={t.costedQty}>
              Invested, avg cost, P&amp;L and return are on the {fmtNum(t.costedQty)} of {fmtNum(t.qty)} {unitNoun} that report a cost.
            </div></>
          : label}
        cells={{
          qty: <td key="qty" className="px-4 py-2.5 text-right mono text-slate-300">{fmtNum(t.qty)}</td>,
          avgCost: (
            <td key="avgCost" className="px-4 py-2.5 text-right mono text-slate-300" data-held-foot-avg={t.avgCost ?? ""}>
              {t.avgCost === null
                ? <AbsentCell reason={noCostWhy} />
                : <span title={partial ? `Cost over the ${fmtNum(t.costedQty)} of these ${fmtNum(t.qty)} ${unitNoun} that report one — the rest are in an account whose statement reports no cost.` : undefined}>
                    {price(t.avgCost)}</span>}
            </td>
          ),
          cmp: (
            <td key="cmp" className="px-4 py-2.5 text-right mono text-slate-300">
              {marks.length > 1
                ? <AbsentCell reason={`the statements reporting this holding do not agree on a mark — ${marks.join(" and ")}. No one price covers the rows, and a weighted mean of them is a figure no statement printed`} />
                : marks.length === 0
                ? <AbsentCell reason="no statement reports a per-unit price for this holding — it is marked at a total value" />
                : marks[0]}
            </td>
          ),
          invested: (
            <td key="invested" className="px-4 py-2.5 text-right mono text-slate-300"
              title={partial ? `Covers the ${fmtNum(t.costedQty)} of these ${fmtNum(t.qty)} ${unitNoun} that report a cost.` : undefined}>
              {t.cost === null ? <AbsentCell reason={noCostWhy} /> : money(t.cost)}
            </td>
          ),
          current: <td key="current" className="px-4 py-2.5 text-right mono text-slate-100">{money(t.mv)}</td>,
          pnl: (
            <td key="pnl" className={`px-4 py-2.5 text-right mono ${changeColor(t.pnl)}`}
              title={partial ? `On the ${fmtNum(t.costedQty)} ${unitNoun} that report a cost.` : undefined}>
              {t.pnl === null ? <AbsentCell reason={noCostWhy} /> : money(t.pnl, true)}
            </td>
          ),
          return: (
            /* FIFO, OVER THE ROWS THAT REPORT A COST — the figure the tiles
               above print, struck once in `measuredTotals`. Where those rows are
               not every row, the Total row's own line says which units it is. */
            <td key="return" className={`px-4 py-2.5 text-right mono ${changeColor(t.costedReturn)}`}
              data-held-foot-return={t.costedReturn ?? ""}
              title={t.costedReturn === null ? undefined
                : `The holding-period return across ${partial ? `the ${fmtNum(t.costedQty)} ${unitNoun} above that report a cost` : "every row above"}, FIFO — the unrealised gain on what is held and the realised gain on units already sold, over the cost of both. Not annualised: these rows were bought on different dates, so there is no single window to compound over. ${fifoBasisNote(t.fifo, (n) => money(n))}`}>
              {t.cost === null
                ? <AbsentCell reason={noCostWhy} />
                : t.costedReturn === null
                ? <AbsentCell reason="no statement for these rows reports the P&L a return is struck on" />
                : <><span className="ret-tag mr-0.5">HPR</span>{fmtPct(t.costedReturn, { sign: true, decimals: 1 })}</>}
            </td>
          ),
        }} />
    );
  };

  /** The derived footer line: one figure, under Current, saying what it is. */
  const derivedFoot = (value: number, label: ReactNode, key: string, kind: "derived" | "exposure", title: string) => (
    <TrFoot view={posView} key={key} className={`px-4 py-2 text-left ${kind === "exposure" ? "text-slate-100" : "text-slate-300"}`}
      data-held-foot={kind} data-held-foot-value={value}
      label={label}
      labelTitle={title}
      cells={{
        current: (
          <td key="current" className={`px-4 py-2 text-right mono ${kind === "exposure" ? "text-slate-100" : "text-slate-200"}`} title={title}>
            {money(value)}
          </td>
        ),
      }} />
  );

  // ── WHAT THE ACTIVE TAB DRAWS ────────────────────────────────────────────────
  const measuredRoutes = (["direct", "manager", "other"] as const).filter((r) => ht.sections[r].lines > 0);
  const fundLinesShown = fl.status === "ok" && fl.lines.length > 0;
  /** Sections the All tab draws — a band is chrome, so only where there are two or more. */
  const allSections = HELD_ROUTES.filter((r) => (r === "fund" ? tabsShown && fundLinesShown : ht.sections[r].lines > 0));
  const bands = heldTab === "all" && allSections.length > 1;
  /** The statement rows on screen, for the "carry both, count once" note. */
  const visibleMeasured = heldTab === "all" ? rows
    : heldTab === "funds" ? [] : ht.sections[TAB_ROUTE[heldTab]].positions;
  const visibleDup = sum(visibleMeasured.map((r) => r.marketValue)) - sum(dedupedPositions([...visibleMeasured]).map((r) => r.marketValue));
  const measuredLabel = (routes: readonly HeldRoute[]) =>
    routes.length ? `Total · ${routes.map((r) => HELD_ROUTE_LABEL[r]).join(" + ")}` : "Total";
  const DERIVED_TITLE = "DERIVED, not a position: each fund's own monthly filing gives this company's weight in the fund, and the family's share is its holding of the fund times that weight. It is never added to the book's own value — the fund's value already stands for it there.";
  const EXPOSURE_TITLE = "Your statements' own figure plus your derived share inside your funds — the figure the Portfolio Monitor's security view calls Total exposure. It is not a book value: the derived half is already inside the funds' own values in the book.";

  /** Each tab's figure and whether it has anything to open. */
  const tabInfo = (k: HeldTab): { text: string; value: number | null; lines: number; disabled: boolean; title: string } => {
    if (k === "all") {
      const lines = rows.length + (fl.status === "ok" ? fl.lines.length : 0);
      return {
        text: ht.total !== null ? money(ht.total) : "", value: ht.total, lines, disabled: false,
        title: ht.total !== null && fl.status === "ok" && fl.lines.length > 0
          ? `Every way the family holds ${name}: ${money(whole.mv)} reported by its statements and ${money(fl.derived)} derived inside its funds.`
          : `Every way the family holds ${name}.`,
      };
    }
    const route = TAB_ROUTE[k];
    if (route === "fund") {
      if (fl.status === "loading") return { text: "…", value: null, lines: 0, disabled: true, title: "Reading your funds' monthly filings." };
      if (fl.status === "unreachable") return { text: "—", value: null, lines: 0, disabled: true, title: "The fund look-through did not answer — a fact about the fetch, not about the holding." };
      return fl.lines.length
        ? { text: money(fl.derived), value: fl.derived, lines: fl.lines.length, disabled: false,
            title: `${HELD_ROUTE_NOTE.fund} ${fl.funds} fund${fl.funds === 1 ? "" : "s"} disclose it, held through ${fl.lines.length} account${fl.lines.length === 1 ? "" : "s"}.` }
        // "NONE" STAYS OPEN, because it still has something to say: which funds
        // were read, and that the AIF folios disclose nothing at all.
        : { text: "none", value: 0, lines: 0, disabled: false, title: `None of the funds this book can read discloses ${name}.` };
    }
    const s = ht.sections[route];
    return s.lines
      ? { text: money(s.value), value: s.value, lines: s.lines, disabled: false, title: `${HELD_ROUTE_NOTE[route]} ${s.lines} account${s.lines === 1 ? "" : "s"}.` }
      : { text: "none", value: 0, lines: 0, disabled: true,
          title: route === "direct" ? `No own demat or broking statement reports ${name} — the family holds none of it directly.`
            : route === "manager" ? `No PMS mandate statement reports ${name}.` : "No other account reports it." };
  };
  const heldTabs = tabsShown && (
    <div className="inline-flex shrink-0 flex-wrap items-center gap-0.5 rounded-md border border-ink-600 bg-ink-800/60 p-0.5"
      role="tablist" aria-label="How this is held" data-held-tabs>
      {HELD_TABS.filter((v) => v.key !== "other" || ht.sections.other.lines > 0).map((v) => {
        const f = tabInfo(v.key);
        const on = heldTab === v.key;
        return (
          <button key={v.key} type="button" role="tab" aria-selected={on} aria-disabled={f.disabled || undefined}
            data-held-tab={v.key} data-held-tab-value={f.value ?? ""} data-held-tab-lines={f.lines} title={f.title}
            onClick={() => { if (!f.disabled) setHeldTab(v.key); }}
            className={["whitespace-nowrap rounded px-2 py-0.5 text-[11px] font-medium transition-colors",
              on ? "bg-champagne-500 text-ink-950"
                : f.disabled ? "cursor-default text-slate-600"
                : "text-slate-400 hover:bg-ink-700/60 hover:text-slate-200"].join(" ")}>
            {v.label}
            {f.text && <>{" "}<span className={on ? "opacity-75" : "text-slate-500"}>{f.text}</span></>}
          </button>
        );
      })}
    </div>
  );

  return (
    <div>
      {/* THE CRUMB NAMES THE HOLDING, NOT THE ROUTE. It read "Stock Info" on
          every one of 213 names, which is a description of the page; and the
          three buttons replace "Back to holdings", a hardcoded step to the
          Portfolio Monitor that was wrong for every reader who arrived from
          Sector Composition, a mandate, a drill-down or the movers card. */}
      <PageNav className="mb-2" trail={[{ label: "Portfolio Monitor", to: "/monitor" }, { label: name }]} />
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-100">{name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {/* WHERE THIS HOLDING IS FILED, which for everything that is not a
                mandate-held share is still exactly its asset class — a fund's
                chip reads AIF, a cash line's reads Cash, and only a share a
                manager chose now reads the mandate bucket instead of a word
                that claims the family picked it. `bucketLabel` and the monitor's
                section headings come from the same function on purpose.

                A fund's `sector` is "Unclassified" in the model — true, and
                misleading on screen, since it reads as a sector nobody got round
                to assigning rather than a property the thing does not have. That
                is stated separately below. */}
            {buckets.map(([k]) => (
              <Pill key={k} tone={k === MANDATE_BUCKET || k === DIRECT_EQUITY_BUCKET || k === UNROUTED_EQUITY_BUCKET ? "info" : "core"}>
                <span title={k === MANDATE_BUCKET
                  ? mandateBucketTip
                  : `How the holdings tables group this holding — ${bucketLabel(k)}.`}>{bucketLabel(k)}</span>
              </Pill>
            ))}
            {/* The bucket above says WHERE THE BOOK FILES IT; this says HOW IT
                CAME TO BE HELD. They coincide for a mandate — which is the whole
                point of the regrouping — and they do not for anything else: an
                AIF folio buckets as AIF and is routed as a fund vehicle, and a
                cash sleeve inside a mandate buckets with the mandate while its
                own route is the mandate too. Kept because the route is stated
                per row in the table below and a chip a reader can compare it
                against is how the two are checked against each other. */}
            {routes.map(([k]) => (
              <Pill key={k} tone="core">
                <span title={ROUTE_NOTE[k as keyof typeof ROUTE_NOTE]}>via {ROUTE_LABEL[k as keyof typeof ROUTE_LABEL]}</span>
              </Pill>
            ))}
            {sector && !fundVehicle && <Pill tone="info">{sector}</Pill>}
            {fundVehicle && (
              <span className="text-[11px] text-slate-600" title="A GICS sector is a property of a company. This holding is a wrapper over many of them and no statement here prints a sector for it.">
                no sector — a fund holds many
              </span>
            )}
            {/* The provider's own sector label, kept alongside ours — the
                taxonomies differ per platform and neither is authoritative. */}
            {providerSector && providerSector !== sector && (
              <Pill><span title="Sector exactly as the provider printed it">{providerSector}</span></Pill>
            )}
            {isin
              ? <span className="mono text-[11px] text-slate-500">{isin}</span>
              : !resolving && <span className="text-[11px] text-slate-600" title={fundOnly
                  ? "No fund filing that discloses this company carries an ISIN for it."
                  : "This provider reports no ISIN for this holding."}>no ISIN reported</span>}
            {sym && <span className="mono text-[11px] text-slate-500">{sym}</span>}
            {/* WHAT THE PILL CLAIMS DEPENDS ON WHICH OF THREE THINGS THIS IS, and
                while the look-through has not answered a no-row page cannot tell
                them apart — so it claims nothing rather than "Position closed". */}
            {fundOnly
              ? <Pill tone="info"><span data-stock-held="funds-only"
                  title="No statement issued to this family reports this company, so there is no account, quantity or cost for it. The family holds it through the funds listed below — derived from each fund's own monthly filing, and no part of the book's own value.">
                  Held only inside your funds</span></Pill>
              : !resolving && <Pill>{unchecked ? "No direct holding" : exited ? "Position closed" : `Held in ${held} ${held === 1 ? "entity" : "entities"}`}</Pill>}
            {/* ...AND THE OTHER ROUTE, BESIDE IT, where a company is held both
                ways: a reader who sees "Held in 3 entities" has otherwise no hint
                that ten funds hold it too until they reach the table. */}
            {!fundOnly && ht.fundLines.status === "ok" && ht.fundLines.funds > 0 && (
              <Pill><span data-stock-held-funds={ht.fundLines.funds}
                title="Derived from each fund's own monthly filing — see the Mutual funds tab of Position by account below. Never added to this holding's own value.">
                also inside {ht.fundLines.funds} of your funds</span></Pill>
            )}
          </div>
        </div>
        {!exited && !fundOnly && !resolving && (
          <div className="text-right">
            {/* ONE FIGURE OR NONE — never one statement's mark standing for
                the rest. See `cmpMarks` for what the split is and why the
                cell refuses it rather than picking. */}
            <div className="mono text-2xl font-semibold text-slate-100" data-stock-mark={cmpSplit ? "split" : cmp === null ? "none" : "one"}>
              {cmp ?? <AbsentValue />}
            </div>
            {/* WHY THIS IS THREE STATES AND NOT TWO.
                It read `live ? "live" : "no live quote for this security"`, so
                every not-live case asserted the same thing — including the one
                where the fetch had simply not come back yet. On a page still
                loading, the top bar said "Fetching prices…" while this line said
                the security has no live quote: two contradictory claims on one
                screen, and the wrong one is the specific one a reader believes.
                That is the "your session expired" failure again — a message must
                diagnose the ACTUAL failure.

                The states are genuinely different facts, and `PortfolioContext`
                already separates them: a name with no NSE symbol can NEVER go
                live and no token would change it, while a symbol whose quote did
                not arrive is a feed shortfall that may resolve on a refresh. */}
            <div className="mt-0.5 text-[10.5px] text-slate-500" data-stock-mark-note>
              {/* A SPLIT MARK IS ITS OWN STATE, AND IT COMES FIRST. The three
                  live/not-live states below all presuppose there IS one mark to
                  describe; over a holding whose statements disagree, every one
                  of them would caption a figure the cell is not showing. */}
              {cmpSplit
                ? `CMP · the statements reporting this holding do not agree on a mark — ${cmpMarks.join(" and ")}, ${
                    cmpDates.length > 1 ? `drawn ${cmpDates[0]} to ${cmpDates[cmpDates.length - 1]}` : `all drawn ${cmpDates[0] ?? portfolio.asOf}`
                  }. Each is beside its own statement in Position by account below.`
                : cmp === null
                ? "no per-unit mark — this holding is reported at a total value, not a price per unit"
                : navMark
                ? `NAV · AMFI's published figure for ${navMark.scheme}, ${navMark.date}${
                    navMark.changePct == null ? "" : ` · ${navMark.changePct >= 0 ? "+" : ""}${navMark.changePct.toFixed(2)}% on the day`
                  } — a fund resolves no NSE trading symbol, so this is the industry's own daily NAV rather than an intraday quote${
                    rows.some((r) => r.depositoryUnits)
                      ? "; some units here are a depository's own closing balance, on an account that sent no holding statement, so no statement prices them"
                      : ""}`
                : live
                ? `CMP · live${sym ? ` · ${sym}` : ""}`
                : (() => {
                    // THE STATEMENT THAT SUPPLIED THE FIGURE, not the first array
                    // element: `rows[0]` may be a row carrying no mark at all, in
                    // which case this dated the shown price to the wrong document.
                    const marked = rows.find((r) => r.currentPrice != null);
                    const mark = `CMP · statement mark${marked ? `, ${accIdx.get(marked.accountId)?.asOf ?? portfolio.asOf}` : ""}`;
                    if (quotesStatus === "loading") return `${mark} — fetching the live price…`;
                    if (!sym) return `${mark} — no NSE symbol resolves for this name, so it cannot be priced live`;
                    if (quotesStatus === "unavailable") return `${mark} — the price feed did not respond`;
                    return `${mark} — the price feed returned no quote for ${sym}`;
                  })()}
            </div>
          </div>
        )}
      </div>

      {/* ABOVE THE FOLD, NOT SIX CARDS DOWN.
          The "Held via" column three cards below has always carried this, and
          the family read the page top-to-bottom and formed their belief from the
          chip before they ever reached it. A fact that contradicts what a reader
          has already concluded has to arrive before the conclusion does. It
          names the mandate and links to it, because "a manager chose this" with
          no way to see WHAT ELSE that manager chose is half an answer. */}
      {mandates.length > 0 && (
        <p className="mb-4 text-[12.5px] leading-relaxed text-slate-400">
          <span className="font-medium text-slate-300">Held through {mandates.length === 1 ? "a discretionary mandate" : `${mandates.length} discretionary mandates`}</span>
          {/* THE NOUN IS DERIVED, NOT TYPED — see `mandateAllShares` above. This
              sentence renders for every mandate-held row, and a mandate's bucket
              takes its whole account, so "these shares" was printed over the
              cash sleeve, the liquid sweep and a TDS receivable as well as over
              Jammu & Kashmir Bank. A mixed set gets the neutral wording rather
              than one of its classes speaking for the rest. */}
          {mandateAllShares
            ? " — the family owns these shares and the manager decides them: "
            : mandateNoShares && mandateClass
              ? ` — this is ${mandateClass} the mandate ${mandates.length === 1 ? "account holds" : "accounts hold"}, not a share the manager chose: `
              : " — the family owns these holdings and the manager runs the accounts they sit in: "}
          {mandates.map((m, i) => (
            <span key={m.accountId}>
              {i > 0 && ", "}
              <Link to={`/mandate/${encodeURIComponent(m.accountId)}`} className="text-champagne-400 hover:underline" title="Open the mandate — every holding the manager runs inside it, and the statement it ties to">{m.label}</Link>
              <span className="text-slate-500">{m.label === m.provider ? "" : ` · ${m.provider}`} · {m.owner}</span>
            </span>
          ))}
          {". Every other holding in "}{mandates.length === 1 ? "that mandate" : "those mandates"}{" is on "}
          {mandates.length === 1 ? "its" : "their"}{" own page."}
        </p>
      )}

      {/* KPI strip — every tile is a figure off the book's own statement rows,
          so a company no statement reports has none of them to show. Six dashes
          (or worse, six zeros) over a page whose whole answer is the fund lines
          below would read as a holding that is missing rather than one held
          another way. */}
      {!fundOnly && !resolving && (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Holding value" value={fmtFromBase(mv, { compact: true })} sub={`${weight.toFixed(1)}% of book`} icon={<Wallet className="h-4 w-4" />} />
        {/* THE SAME TYPED NOUN, ONE TILE OVER. `/stock/:securityKey` serves every
            holding, so "shares held" was printed under the quantity of an AIF
            folio's units and under a mandate's cash balance. It comes off the
            asset class the row carries, and an unstated class gets the noun that
            claims nothing. */}
        <Kpi label="Quantity" value={fmtNum(qty)} sub={qtyNoun} icon={<Layers className="h-4 w-4" />} />
        {/* Both of these say WHY when they are absent — see `costWhy`. The dash
            is correct on 60 of this book's positions and it is not the whole
            answer: "invested —" and "on cost" told a reader nothing about
            whether the figure was missing or the page was broken. */}
        {/* WHICH UNITS THE AVERAGE IS OVER, where that is not all of them. The
            figure itself is now cost over the costed units (`whole.avgCost`), and
            a reader comparing it with the Quantity tile beside it needs to be
            told the two cover different units. */}
        <Kpi label="Avg cost"
          value={avgCost === null ? <AbsentValue /> : <span className="mono" data-stock-avg-cost={avgCost}>{price(avgCost)}</span>}
          sub={cost === null ? <span className="text-slate-500">{costWhy}</span>
            : carried ? <span title={carriedWhy} data-stock-cost-carried={carried.paid}>invested {money(cost)} &middot; as paid, across a class switch</span>
            : costedShare ? <span data-stock-cost-covers={costedShare}
                title={`A cost is reported for ${costedShare}; the rest are held in an account whose statement reports none, so the average is over the ${costedShare.split(" of ")[0]} that have one.`}>
                invested {money(cost)} &middot; on {costedShare}</span>
            : `invested ${money(cost)}`}
          icon={<Coins className="h-4 w-4" />} />
        <Kpi label="Unrealised P&L"
          value={pnl === null ? <AbsentValue /> : <span className={changeColor(pnl)}>{fmtFromBase(pnl, { compact: true, sign: true })}</span>}
          delta={ret}
          sub={pnl === null ? <span className="text-slate-500">{costWhy}</span>
            : <span title={fifoBasisNote(fifo, (n) => money(n))}>return · FIFO{fifo.realised ? ` · incl. ${money(fifo.realised, true)} realised` : ""}{costedShare ? ` · on ${costedShare}` : ""}</span>}
          icon={<TrendingUp className="h-4 w-4" />} />
        {/* Realised P&L exists only where a capital gain statement covers this
            name's sells. Null is not zero: the sells may be real and what they
            realised simply never reported. */}
        <Kpi label="Realised P&L"
          value={led === undefined ? "…" : led?.realizedProfit == null
            ? <AbsentValue />
            : <span className={changeColor(led.realizedProfit)}>{fmtFromBase(led.realizedProfit, { compact: true, sign: true })}</span>}
          sub={led === undefined ? "booked on exits" : led?.realizedProfit == null
            ? <span className="text-slate-500">no capital gain statement covers this name</span>
            : "booked on exits"}
          icon={<Activity className="h-4 w-4" />} />
        <Kpi label="Change today"
          value={dayPct == null ? <span className="text-slate-500">—</span> : <span className={changeColor(dayPct)}>{fmtPct(dayPct, { sign: true })}</span>}
          sub={dayPct == null ? "no live quote" : `${fmtFromBase(dayChange, { compact: true, sign: true })} on the position`}
          icon={<Building2 className="h-4 w-4" />} />
      </div>
      )}

      {resolving ? null : exited ? (
        unchecked ? (
          <Card className="mt-5" title="Position" subtitle="No statement in this book reports a current holding in this name.">
            <p className="text-sm text-slate-400" data-stock-unchecked>
              Whether your funds hold it could not be checked — the fund look-through did not load. Refresh to retry.
            </p>
          </Card>
        ) : (
          <Card className="mt-5" title="Position" subtitle="This name is fully exited — no current holding.">
            <p className="text-sm text-slate-400">Realised P&amp;L and the full transaction history are below.</p>
          </Card>
        )
      ) : (
        <>
          {/* FULL WIDTH, AND THE TAX CARD MOVED BELOW IT.
              *"ideally, I would not want to do one more scroll. One more click
              on the right side is not desirable… use that space for showing
              this column in entirety. And then tax maybe just make it a
              click."* Measured at 1500×950 before the change: this table needed
              1,508px inside a 953px card, so six columns including RETURN sat
              off the right edge. Collapsing the tax card in place would not have
              helped — it would still have held a third of the row — so it leaves
              the row entirely and becomes a click. */}
          <Card className="mt-5" title="Position by account"
            subtitle={tabsShown
              ? "Every way the family holds this — in its own accounts, through a PMS manager, and inside the funds it holds"
              : "How this name is held — the owning entity, who chose the position, and the platform that runs the account"}
            right={heldTabs || undefined}
            pad={false}>
            <div className="overflow-x-auto">
              <table className="min-w-full whitespace-nowrap text-sm" data-held-table={heldTab}>
                <thead className="border-b border-ink-700">
                  <Tr view={posView}>
                    <SortHeader col="entity" view={posView} align="left">Entity</SortHeader>
                    {/* HELD VIA MERGED IN HERE, AND THE COLUMN IS GONE.
                        *"This 'held via' can actually hide… use that space for
                        showing this column in entirety."* Measured before it was
                        moved: this table needed 1,508px inside a 953px card, so
                        Avg cost, Invested, Current, Unrealised P&L, RETURN and
                        Basis were all off the right edge and a reader had to
                        scroll the card sideways to reach the one figure they
                        came for. The route is not dropped with the column —
                        WHO CHOSE a position is the distinction Stage 10j and
                        10L exist for, and the mandate link is still the only
                        door into the manager's own book from this page. Both
                        ride in this cell now. */}
                    <SortHeader col="managedBy" view={posView} align="left">Managed by · held via</SortHeader>
                    <SortHeader col="qty" view={posView}>Qty</SortHeader>
                    <SortHeader col="avgCost" view={posView}>Avg cost</SortHeader>
                    <SortHeader col="cmp" view={posView}
                      title="The per-unit mark this account's own statement prints, on its own report date — not a live quote and not market value divided by quantity. Where two statements report one holding they need not agree: a later statement carries a later price, and two rows of one scheme on one date that disagree are a discrepancy this book reports rather than averages.">CMP</SortHeader>
                    <SortHeader col="invested" view={posView}>Invested</SortHeader>
                    <SortHeader col="current" view={posView}>Current</SortHeader>
                    <SortHeader col="pnl" view={posView}>Unreal. P&L</SortHeader>
                    <SortHeader col="return" view={posView}
                      title="HPR is the holding-period return — the total on cost from purchase to this statement's date, not annualised. CAGR appears beside it only where a lot register reports the purchase date and the holding is at least a year old; a shorter window is never compounded onto a year. XIRR appears only on a row that is a WHOLE account whose every payment in and out is dated — a fund folio, a drawdown fund — solved over the same record the Transactions card uses; a holding inside an account has no cash flows of its own, so it has none.">Return</SortHeader>
                    <SortHeader col="basis" view={posView}>Basis</SortHeader>
                  </Tr>
                </thead>
                <tbody className="divide-y divide-ink-700/60">
                  {heldTab === "all" ? (
                    <>
                      {/* EVERY ROUTE AS A SECTION OF ONE TABLE, in the order a
                          reader asks: what the family chose, what its managers
                          chose, and what its funds hold. A band only where there
                          are two or more — one section is already the table. */}
                      {allSections.map((route) => route === "fund" ? (
                        <Fragment key="fund">
                          {bands && routeBand("fund", fl.status === "ok" ? fl.derived : null,
                            fl.status === "ok" ? `${fl.funds} fund${fl.funds === 1 ? "" : "s"} · ${fl.lines.length} line${fl.lines.length === 1 ? "" : "s"} · your share of what each fund's filing discloses` : "")}
                          {fl.status === "ok" && sortedFunds(fl.lines).map(fundRow)}
                          {fundNote()}
                        </Fragment>
                      ) : (
                        <Fragment key={route}>
                          {bands && routeBand(route, ht.sections[route].value,
                            `${ht.sections[route].lines} account${ht.sections[route].lines === 1 ? "" : "s"} · ${route === "direct" ? "the family's own demat or broking" : route === "manager" ? "chosen by a discretionary manager" : "route not stated"}`)}
                          {sortedPositions(ht.sections[route].positions).map(measuredRow)}
                        </Fragment>
                      ))}
                    </>
                  ) : heldTab === "funds" ? (
                    fundLinesShown && fl.status === "ok"
                      ? <>{sortedFunds(fl.lines).map(fundRow)}{fundNote()}</>
                      : <>{emptyRoute("fund")}{fundNote()}</>
                  ) : ht.sections[TAB_ROUTE[heldTab]].lines > 0 ? (
                    sortedPositions(ht.sections[TAB_ROUTE[heldTab]].positions).map(measuredRow)
                  ) : (
                    emptyRoute(TAB_ROUTE[heldTab])
                  )}
                </tbody>
                <tfoot className="border-t-2 border-ink-600 font-semibold">
                  {heldTab === "all" ? (
                    <>
                      {rows.length > 0 && measuredFoot(rows,
                        tabsShown && fundLinesShown ? measuredLabel(measuredRoutes) : <>Total</>, "measured")}
                      {tabsShown && fundLinesShown && fl.status === "ok" && derivedFoot(fl.derived,
                        <>Inside your mutual funds <span className="font-normal text-champagne-400/80">· derived</span></>,
                        "derived", "derived", DERIVED_TITLE)}
                      {tabsShown && fundLinesShown && rows.length > 0 && ht.total !== null && derivedFoot(ht.total,
                        <>Total exposure <span className="font-normal text-slate-400">· incl. derived</span></>,
                        "exposure", "exposure", EXPOSURE_TITLE)}
                    </>
                  ) : heldTab === "funds" ? (
                    fundLinesShown && fl.status === "ok" && derivedFoot(fl.derived,
                      <>Total inside your mutual funds <span className="font-normal text-champagne-400/80">· derived</span></>,
                      "derived", "derived", DERIVED_TITLE)
                  ) : ht.sections[TAB_ROUTE[heldTab]].lines > 0 ? (
                    measuredFoot(ht.sections[TAB_ROUTE[heldTab]].positions, measuredLabel([TAB_ROUTE[heldTab]]), "measured")
                  ) : null}
                </tfoot>
              </table>
            </div>
            {/* CARRY BOTH, COUNT ONCE — and SAY SO where both are on screen.
                Every row above is a statement as its issuer printed it, so a
                name reported under two members has two rows; the Total is the
                consolidated figure, which counts the holding once. Without this
                line the two disagree by exactly the duplicate and a reader who
                adds the column has found a contradiction. */}
            {visibleDup > 1 && (
              <p className="border-t border-ink-700/60 px-4 py-2.5 text-[11px] leading-relaxed text-slate-500">
                The rows above add to {money(sum(visibleMeasured.map((r) => r.marketValue)))}: this is ONE holding, reported on
                each of the {held} statements listed. Both are shown as printed, and the Total counts it once —
                {money(measuredTotals(visibleMeasured).mv)}, the same basis as the current value of holdings. Which statement owns it is a question about the
                family's affairs, not a parsing rule, so neither row is suppressed.
              </p>
            )}
            {/* AND THE FUND LINES' OWN "COUNT ONCE", which no holding in this
                book exercises today: a fund reported by two statements would
                put its lines above at their printed values while the derived
                total counts the fund once. Said where it would happen. */}
            {(heldTab === "all" || heldTab === "funds") && fl.status === "ok" && fl.printed - fl.derived > 1 && (
              <p className="border-t border-ink-700/60 px-4 py-2.5 text-[11px] leading-relaxed text-slate-500" data-held-fund-overlap>
                The fund lines above add to {money(fl.printed)} as each statement prints its holding; a fund two
                statements both report is counted once in the derived total, {money(fl.derived)}.
              </p>
            )}
          </Card>

          <CorporateActionReturns securityKey={securityKey} />
          {/* NOTHING TO SPLIT ON A COMPANY HELD ONLY INSIDE FUNDS: every line in
              this card is about the family's OWN lots — cost, purchase dates,
              dividends, weight — and there are none, so it would be a card of
              dashes and a "0.0%" weight that reads as a measured one. */}
          {!fundOnly && (
          <Card className="mt-5" title="Tax basis & holding" pad={false}>
            <details className="group">
              <summary className="cursor-pointer list-none px-4 py-2.5 text-[12px] text-slate-400 hover:text-slate-200"
                data-tax-toggle>
                <span className="text-champagne-400">Show</span> the long/short cost split, the purchase dates, the
                dividends recorded and this holding's weight in the book
              </summary>
              <div className="px-4 pb-3">
            <div className="flex items-center justify-between py-2 text-sm"><span className="text-slate-400">Long-term cost</span><span className="mono text-slate-100">{ltCost === null ? <AbsentCell reason="the long/short split needs per-lot purchase dates, and only a lot register carries them — see the note below" /> : money(ltCost)}</span></div>
            <div className="flex items-center justify-between border-t border-ink-700/60 py-2 text-sm"><span className="text-slate-400">Short-term cost</span><span className="mono text-slate-100">{stCost === null ? <AbsentCell reason="the long/short split needs per-lot purchase dates, and only a lot register carries them — see the note below" /> : money(stCost)}</span></div>
            <div className="mt-2 flex h-2.5 overflow-hidden rounded-full border border-ink-700">
              <div style={{ width: `${ltPct ?? 0}%`, background: "#10b981" }} />
              <div style={{ width: `${ltPct === null ? 0 : 100 - ltPct}%`, background: "rgba(245,158,11,.5)" }} />
            </div>
            {/* No lot dates in this book, so the split is unknown — say so rather
                than drawing an empty bar that reads as "all short-term". */}
            <div className="mt-1.5 flex justify-between text-[10.5px] text-slate-500">
              {ltPct === null
                ? <span>Long-term / short-term split {DASH} no lot dates on the statements</span>
                : <><span>Long-term {ltPct.toFixed(0)}%</span><span>Short-term {(100 - ltPct).toFixed(0)}%</span></>}
            </div>
            {/* A purchase date only exists where the statements' window covers
                the buy. Absent here means "not in this window", not "never
                bought" — the tooltip says which. */}
            <div className="mt-2 flex items-center justify-between border-t border-ink-700/60 py-2 text-sm"><span className="text-slate-400">First bought</span><span className="mono text-slate-100">{firstBought ? fmtDate(firstBought) : led === undefined ? "…" : <AbsentCell reason="no purchase in the window the transaction statements cover — this holding predates it" />}</span></div>
            <div className="flex items-center justify-between border-t border-ink-700/60 py-2 text-sm"><span className="text-slate-400">Last added</span><span className="mono text-slate-100">{lastAdded ? fmtDate(lastAdded) : led === undefined ? "…" : <AbsentCell reason="no purchase in the window the transaction statements cover" />}</span></div>
            <div className="flex items-center justify-between border-t border-ink-700/60 py-2 text-sm"><span className="text-slate-400">Dividends recorded</span><span className="mono text-slate-100">{div !== null && div > 0 ? fmtFromBase(div, { compact: true }) : <AbsentCell reason="no dividend statement in this book records an event in this name" />}</span></div>
            {/* The denominator is the WHOLE consolidated book — see `bookMV`
                above, which is deliberately not the listed subset because this
                page serves every holding. The label said "listed book" anyway,
                so an AIF folio's page read "Weight in listed book 38.0%" about a
                holding that is not listed and against a total that is not the
                listed one. Wrong on both halves of a three-word label. */}
            <div className="flex items-center justify-between border-t border-ink-700/60 py-2 text-sm"><span className="text-slate-400">Weight in book</span><span className="mono text-slate-100" title="Share of the current value of holdings — every asset class, each dually-reported holding counted once.">{weight.toFixed(1)}%</span></div>
              </div>
            </details>
          </Card>
          )}
        </>
      )}

      {/* OPENING, PLUS, MINUS, CLOSING — read off the depository statement,
          which prints all four. Above the tape deliberately: the family asked
          for the quantity account first and the dated rows second. */}
      <QuantityMovement movements={moves} unmoved={unmoved} accounts={portfolio.accounts}
        held={new Set(rows.map((p) => p.accountId))} />

      {/* Transaction history — on a company held only inside funds, only where
          the family's own accounts traded it (a name sold out of a demat that a
          fund still holds). Otherwise it is a card explaining an empty window
          for a holding that was never theirs to trade. */}
      {!resolving && (!fundOnly || (led != null && led.txns.length > 0)) && (
      <Card className="mt-5" title="Transaction history" subtitle='Every dated buy & sell from the ledger — the "Transaction Info" drill-down' pad={false}
        right={led && led.txns.length ? <Pill>{led.txns.length} rows · {led.txns.filter((t) => t.side === "Sell").length} sells</Pill> : undefined}>
        <div className="max-h-[460px] overflow-auto">
          {led === undefined ? (
            <div className="grid h-32 place-items-center text-sm text-slate-500">Loading transactions…</div>
          ) : led == null ? (
            <div className="grid h-32 place-items-center px-6 text-center text-sm text-slate-500">
              The audit archive didn't respond. Refresh to retry — it is served alongside the app, so this is the
              archive being unreachable rather than your session being stale.
            </div>
          ) : led.txns.length === 0 ? (
            <div className="grid h-32 place-items-center px-6 text-center text-[12.5px] leading-relaxed text-slate-500">
              <span className="max-w-md">
                No transaction in this name over the window the statements cover
                {led.periodFrom && led.periodTo ? <> ({fmtDate(led.periodFrom)} → {fmtDate(led.periodTo)})</> : null}.
                A holding bought before that window and untraded since carries no row here — the transaction
                statements are a period record, not a lot history.
              </span>
            </div>
          ) : (
            <table className="min-w-full whitespace-nowrap text-sm">
              <thead className="sticky top-0 bg-ink-800 border-b border-ink-700">
                <Tr view={txnView}>
                  <SortHeader col="date" view={txnView} align="left">Date</SortHeader>
                  <SortHeader col="type" view={txnView} align="left">Type</SortHeader>
                  <SortHeader col="entity" view={txnView} align="left">Entity</SortHeader>
                  <SortHeader col="qty" view={txnView}>Qty</SortHeader>
                  <SortHeader col="rate" view={txnView}>Rate</SortHeader>
                  <SortHeader col="amount" view={txnView}>Amount</SortHeader>
                </Tr>
              </thead>
              <tbody className="divide-y divide-ink-700/60">
                {sortRows(led.txns, txnView.sort, {
                  date: (t) => t.date,
                  type: (t) => t.side,
                  entity: (t) => t.account,
                  qty: (t) => t.qty,
                  rate: (t) => t.rate,
                  amount: (t) => t.amount,
                }).map((t, i) => (
                  <Tr view={txnView} key={i} className="hover:bg-ink-700/40">
                    <td className="px-4 py-2 mono text-[12px] text-slate-400">{fmtDate(t.date)}</td>
                    <td className="px-4 py-2">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${t.side === "Buy" ? "bg-indigo-500/10 text-indigo-300" : "bg-red-500/15 text-loss"}`}>{t.side === "Buy" ? "BUY" : "SELL"}</span>
                    </td>
                    <td className="px-4 py-2 text-[13px] text-slate-300">{t.account}</td>
                    <td className="px-4 py-2 text-right mono text-slate-300">{fmtNum(t.qty)}</td>
                    <td className="px-4 py-2 text-right mono text-slate-400">{price(t.rate)}</td>
                    <td className="px-4 py-2 text-right mono text-slate-200">{fmtFromBase(t.amount, { compact: true })}</td>
                  </Tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>
      )}

      {/* Investment tools are the family's OWN judgements — a target price or a
          review date is as meaningful against a fund as against a company — so
          they render for every holding. */}
      {/* WHAT THE FUND HOLDS — the look-through, where a disclosure resolves.
          Placed ABOVE the research-absence card because it answers the question
          that card used to have to refuse: "what companies am I holding through
          this fund". The card below still refuses the COMPANY research (a fund
          has no PE and no concall) and now also states, for a fund with no
          resolved disclosure, that this is why there is no list. */}
      {fundVehicle && rows.length > 0 && canHaveLookthrough(rows[0]) && !arbitrage && (
        <FundLookthrough securityKey={securityKey} name={name} holdingValue={mv} asOfHolding={rows[0] ? accIdx.get(rows[0].accountId)?.asOf ?? portfolio.asOf : portfolio.asOf} />
      )}

      {researchHeld ? (
        researchAbsent && (
          <Card className="mt-5" title="Company research">
            <p className="text-[12.5px] leading-relaxed text-slate-400" data-stock-research="funds-only">
              Research is looked up by the company&rsquo;s NSE symbol. {name} is held only inside your funds, so none of
              your statements names it and no symbol has been looked up for it — which is why its price history,
              ratios, financials and filings are not shown here. It is not a feed being down.
            </p>
          </Card>
        )
      ) : notACompany ? (
        <Card className="mt-5" title={`Company research — not applicable to ${cashFund ? "a cash-equivalent fund" : NOT_A_COMPANY_LABEL[assetClass ?? ""] ?? "this holding"}`}>
          <p className="text-[12.5px] leading-relaxed text-slate-400" data-stock-class={cashFund ? "Cash" : assetClass ?? ""}>
            This holding is <span className="font-medium text-slate-300">{cashFund ? "Cash" : assetClassLabel(assetClass)}</span>
            {cashFund
              ? <> — {arbitrage ? "an arbitrage" : "a liquid"} fund, which the family counts as cash and nothing
                  else; one line standing for a portfolio the manager assembles, not a share in a company.</>
              : fundVehicle
              ? <> — one line standing for a portfolio the manager assembles, not a share in a company.</>
              : <> — a balance, not a share in a company.</>} So there is no price history, no PE, no balance sheet,
            no concall and no insider filing for it, and the five panels that carry those for a company are absent
            here by decision rather than by a feed being down.
          </p>
          {fundVehicle && (
            <>
              <p className="mt-2 text-[12.5px] leading-relaxed text-slate-400">
                The companies inside it are the manager's holdings, not this book's — no statement issued to this family
                names them. {arbitrage
                  ? <>An arbitrage fund discloses its portfolio monthly like any mutual fund, and it is deliberately
                    not drawn here: that portfolio is long shares hedged by short futures, so reading it as the
                    family&rsquo;s exposure to those companies would print stock they do not carry. Its value is
                    counted whole, as cash.</>
                  : canHaveLookthrough(rows[0])
                  ? <>A MUTUAL FUND scheme nonetheless discloses its portfolio monthly, and where that disclosure
                    resolves it is shown above under its own heading. It is the AMC's document, not this family's, so
                    the fund&rsquo;s value still stays whole here and in every total rather than being spread across the
                    sectors of companies the family does not directly own.</>
                  : <>An AIF publishes no such disclosure — SEBI requires a monthly portfolio from a mutual fund and not
                    from a Category II or III alternative fund — so there is no scheme document to join to this folio,
                    and the fund&rsquo;s value stays whole.</>}
              </p>
              {/* WHY THIS HAS TO BE SAID HERE, AND SAID AS A CONTRAST.
                  A reader who has just learnt that a share held through a PMS is
                  listed inside that manager's drill-down will come to a fund
                  expecting the same page and read its absence as something not
                  built yet. The two look alike and are not: a PMS reports every
                  share it holds because the FAMILY owns those shares — the
                  manager only chose them — so the rollup is a real, documented
                  one. A fund unit is one purchase of somebody else's portfolio,
                  the fund owns the companies, and no statement here says which
                  they are. So there is no list to render, and this is a decided,
                  permanent absence rather than an empty table waiting on a feed. */}
              <p className="mt-2 text-[12.5px] leading-relaxed text-slate-400">
                <span className="font-medium text-slate-300">A mandate&rsquo;s constituents and a fund&rsquo;s are two
                different kinds of fact, and the difference is worth keeping in view.</span> Under a mandate the family
                owns each share and the manager merely picks it, so every one is reported BY NAME on a statement issued
                to this family, and the mandate&rsquo;s own page carries all of them at the family&rsquo;s own cost and
                value. A fund unit is the opposite: the fund owns the companies, and what this family is told is only
                what the unit is worth. Anything shown above about what the scheme holds comes from the AMC&rsquo;s
                public disclosure and carries no cost, no purchase date and no figure about this family except the one
                derived from a published weight.
              </p>
            </>
          )}
        </Card>
      ) : (
        <ReturnsTable ticker={sym} name={name} />
      )}

      <InvestmentTools
        securityKey={securityKey}
        name={name}
        price={rows[0]?.currentPrice ?? null}
        priceIsLive={live}
      />

      {!notACompany && !researchHeld && (
        <>
          <RatioTable ticker={sym} name={name} />

          <ResearchPanel ticker={sym} name={name} />

          {/* Deep company research — live 52-week range & insider trades, a pointer
              to the live Research panel above, and previews for the sections no
              endpoint serves as structured data yet. */}
          <CompanyResearchPreview name={name} ticker={sym} price={rows[0]?.currentPrice ?? null} live={live}
            low52={rows[0]?.low52 ?? null} high52={rows[0]?.high52 ?? null} />
        </>
      )}

    </div>
  );
}
