import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { statementNoteForSet } from "@/lib/statementNotes";
import { Link, Navigate, useParams } from "react-router-dom";
import { Wallet, Layers, TrendingUp, Coins, Activity, Tag } from "lucide-react";
import { Card } from "@/components/Card";
import { Pill } from "@/components/Pill";
import { Kpi } from "@/components/Kpi";
import { usePortfolio } from "@/context/PortfolioContext";
import {
  sum, sumOrNull, consolidatedMarketValue, dedupedPositions, isFundVehicle, isCompanyShare, assetClassLabel,
  measuredReturn, valueDateOf, type RowCapital,
  holdingRoute, ROUTE_LABEL, ROUTE_NOTE,
  holdingBucket, bucketLabel, isMandateHeld, mandateLabel,
  MANDATE_BUCKET, DIRECT_EQUITY_BUCKET, UNROUTED_EQUITY_BUCKET, isCashEquivalent,
} from "@/lib/analytics";
import { fmtCurrency, fmtNum, fmtPct, fmtDate, changeColor, DASH } from "@/lib/format";
import { fifoBasisNote, realisedReason } from "@/lib/fifo";
import { liveWithheldReason } from "@/lib/corporateActions";
import { realisedTile } from "@/lib/stockRealised";
import { holdingValuation } from "@/lib/valuedAt";
import { isinAbsentWords } from "@/lib/schemeMatch";
import { AbsentValue, AbsentCell, AbsentSection } from "@/components/Absent";
import { depositoryUnitsGist, describeDepositoryUnits, fundNavFor, isArbitrageFund } from "@/lib/fundNavs";
import { carriedCostOf, carriedCostNote, grossPaidOf, grossPaidNote } from "@/lib/tranches";
import { BOOK_POSITION_TRANCHES } from "@/data/glowData";
import type { Position } from "@/lib/types";

import { loadStockLedger, type StockLedger } from "@/lib/ledger";
import { symbolFor, symbolForKey } from "@/lib/quotes";
import { accountIndex, ownerOf, providerOf, strategyOf, engagementOf } from "@/lib/accounts";
import { ResearchPanel } from "@/components/ResearchPanel";
import { FundLookthrough } from "@/components/FundLookthrough";
import { canHaveLookthrough, companySectorIndex } from "@/lib/lookthrough";
import { useStockExposure } from "@/lib/useStockExposure";
import { UNCLASSIFIED } from "@/lib/sectors";
import { ReturnsTable } from "@/components/ReturnsTable";
import { InvestmentTools } from "@/components/InvestmentTools";
import { QuantityMovement } from "@/components/QuantityMovement";
import { CorporateActionReturns } from "@/components/CorporateActionReturns";
import { PageNav } from "@/components/PageNav";
import { homeKeyOf, recordedFor, type RecordedLine } from "@/lib/recordedHoldings";
import { securityLabel } from "@/lib/securityLabel";
import { useViewParam, type ViewDef } from "@/components/ViewToggle";
import { movementsFor, unmovedAccountsFor } from "@/lib/shareMovements";
import { SortHeader, Tr, TrFoot } from "@/components/SortHeader";
import { useTableView, sortRows } from "@/lib/tableView";
import { useDatedCapital } from "@/lib/useDatedCapital";
import { TREE_ROW, TreeSectionCell } from "@/components/TreeTable";
import { ownerDisplayName } from "@/lib/owners";
import { stockHref } from "@/lib/auditFormulas";
import {
  heldThrough, heldRouteOf, measuredTotals, HELD_ROUTES, HELD_ROUTE_LABEL, HELD_ROUTE_NOTE,
  type FundLine, type HeldRoute,
} from "@/lib/heldThrough";

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
function ReturnCells({ p, valuedAt, capital }: { p: Position; valuedAt: string | null; capital?: RowCapital | null }) {
  // The window ends on the date THIS line's value is struck — its own
  // statement, its NAV or its live quote — never the book's newest date (A-01).
  const at = { ...p, valuedAt };
  const hpr = measuredReturn(at, "absolute", valuedAt ?? "");
  const cagr = measuredReturn({ ...at, capital }, "cagr", valuedAt ?? "");
  // Only where the guard actually annualised. `cagr` falls back to the
  // holding-period figure under a year and tags it HPR — printing that as a
  // second line would show one number twice under two names.
  const annual = cagr.shown && cagr.tag === "CAGR" ? cagr : null;
  const xirr = capital?.dated ? measuredReturn({ ...at, capital }, "xirr", valuedAt ?? "") : null;
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

/**
 * ── ONE TEMPLATE FOR EVERY HOLDING: FIVE TABS, AND THE PAGE DOES NOT SCROLL ──
 *
 * *"When I come inside a portfolio position it's an unbelievably bad UI
 * experience — please fix it all by making top sub tabs like we have done for
 * others and not having a long page I have to scroll, and remove what is not
 * necessary and consolidate what can be consolidated so it's one clean template
 * for all."*
 *
 * Measured before the change at 1500×1000: the company page was 1,496px taller
 * than the window it sat in — a header, six tiles, the account table, a folded
 * tax card, the quantity account, the transaction tape, the price chart, the
 * family's own targets, a ratio table, a research card, a trading-range card, an
 * insider table and a paragraph describing the cards above it, one under
 * another. A fund's page was a different stack again, so no two holdings read
 * the same way.
 *
 * THE SAME FIVE TABS ON EVERY HOLDING, and each answers one question:
 *
 *   Position         who holds it, through which account, at what cost and mark
 *   Transactions     what moved — dated buys and sells, the depository's own
 *                    quantity account, purchase dates and the tax split
 *   Price & returns  a company's price history; a fund's published NAV and its
 *                    own returns; for an AIF or a cash line, a decided absence
 *   Research         a company's financials, ratios, filings and insider deals;
 *                    a fund's disclosed holdings; otherwise a decided absence
 *   My targets       the family's own target price, fair value, levels and notes
 *
 * A tab whose question has no answer for this KIND of holding still opens, and
 * says so once and why — "a card that can never be filled must not look like one
 * that is waiting". Hiding it instead would make the template differ by asset
 * class, which is exactly what was reported.
 *
 * THE HEADER AND THE KPI STRIP ARE OUTSIDE THE PANEL, on every tab, and the
 * panel scrolls inside itself — Morning CIO's construction, and for its reason:
 * what the family asked for is that the headline and the tiles stop moving. The
 * no-scroll layout applies from `lg` up; below it the page flows and scrolls as
 * a phone needs, because a fixed-height column there would squeeze the panel to
 * nothing under six stacked tiles.
 *
 * IN `?tab=` LIKE EVERY OTHER VIEW IN THIS APP, so a tab is a link, Back steps
 * between tabs and `check:pages` reaches each one by URL. The first is
 * param-free. The labels are deliberately NOT the card headings they open, so a
 * check struck on a heading cannot be satisfied by the tab strip.
 */
const STOCK_TABS = [
  { key: "position", label: "Position",
    title: "Who holds it, through which account, at what cost and at what mark" },
  { key: "activity", label: "Transactions",
    title: "Dated buys and sells, the depository's own quantity account, the purchase dates and the tax split" },
  { key: "market", label: "Price & returns",
    title: "The security's own price history and returns — or, for a fund, its published NAV and returns" },
  { key: "research", label: "Research",
    title: "A company's financials, ratios, filings and insider deals — or, for a mutual fund, what it holds" },
  { key: "targets", label: "My targets",
    title: "The family's own target price, fair value, entry and exit levels, alerts and notes for this name" },
] as const;

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
 * say so at all.
 *
 * THE VALUE COLUMN IS "MARKET VALUE" NOW, NOT "CURRENT". Two columns along from
 * CMP it was headed "Current", and a reader scanning for the price found a
 * column called Current and it was money — part of why the missing mark went
 * unnoticed. It takes the Portfolio Monitor's own word for the same figure.
 *
 * AND THE BASIS COLUMN IS GONE. It printed LT or ST per row from the lot
 * register — which exists for ONE account in this book, so the column was a dash
 * on 368 of 371 positions — and the long/short split it summarised is on the
 * Transactions tab's tax card, cost by cost, where the family asked for tax to
 * be "just a click".
 */
const POS_COLS = ["entity", "managedBy", "qty", "avgCost", "cmp", "invested", "current", "pnl", "return"] as const;
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
 *
 * THEY ARE THE POSITION TAB'S OWN, one level under the page's five, and they sit
 * in the table's card header rather than beside the page tabs: they choose which
 * ROWS of one table are drawn, where the page tabs choose which QUESTION the
 * page answers. The two params are independent (`?tab=` and `?held=`), so a
 * reader who picked PMS managers keeps it when they step to Transactions and
 * back.
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

/**
 * Why each measured column is empty on a line derived from a fund's filing.
 * There is no Basis entry: the Basis column is gone from this table (its LT/ST
 * split is on the Transactions tab's tax card), so a fund line has no cell for
 * it either.
 */
const FUND_LINE_WHY = {
  qty: "you own units of the fund, not shares of this company — the fund's filing gives a weight, so your share of it is a value, never a count",
  cost: "you paid for units of the fund, not for these shares — the fund bought them at its own prices, so no cost exists for your share",
  cmp: "a fund's filing gives this company's weight in the fund, not a price per share for your holding",
  pnl: "no cost, so no gain can be struck on your share — the fund's own return is on the fund's page",
} as const;

/** What a holding that is not a company IS, for a heading that says so. */
const NOT_A_COMPANY_LABEL: Record<string, string> = {
  "Mutual Fund": "a mutual fund", ETF: "an ETF", AIF: "an AIF folio", Cash: "a cash line",
};

/**
 * HOW EACH SECTOR TIER IS NAMED, for the sector chip's hover. A sector placed
 * by a fund's filing or by screener.in is borrowed evidence rather than the
 * family's own statement, and a reader cannot tell which from the chip alone.
 */
const SECTOR_FROM: Record<string, string> = {
  book: "as this holding's own statement prints it",
  disclosure: "from a fund's own SEBI portfolio filing, joined on this company's ISIN — the same classification Sector Composition uses",
  vendor: "from screener.in, joined on the NSE symbol — the same classification Sector Composition uses",
};

export function StockInfo() {
  // Keyed by securityKey — this book's providers mostly print a name and nothing
  // else, so an ISIN route would leave most holdings unreachable.
  const { securityKey = "" } = useParams();
  const { portfolio, consolidated, fmtFromBase, convertFromBase, displayCurrency, quotesStatus, corporateActionReturns } = usePortfolio();
  // WHICH TAB IS OPEN — see `STOCK_TABS` for what the five are and why the
  // choice lives in the URL.
  const [tab, setTab] = useViewParam(STOCK_TABS, {}, "tab");
  // …AND WHICH ROUTE THE POSITION TABLE SHOWS — see `HELD_TABS`.
  const [heldTabParam, setHeldTab] = useViewParam(HELD_TABS, {}, "held");
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
  const nowMs = useMemo(() => Date.now(), []);
  // The demat statements' own opening-to-closing quantity account for this
  // name, one row per account that issues a transaction statement.
  const moves = useMemo(() => movementsFor(securityKey), [securityKey]);
  // Accounts that hold this name, issue a transaction statement, and print no
  // block for it — the statement saying it did not move, which a reader shown
  // nothing at all cannot tell from a gap.
  const unmoved = useMemo(() => unmovedAccountsFor(rows), [rows]);
  // ABOVE THE EARLY RETURN — a hook that runs on some renders and not others
  // is a hooks-order error rather than a conditional table. Every hook this
  // page calls is declared here for that reason, including the four memos that
  // used to sit after the return and were a hooks-order bug waiting for a
  // render on which the book had not loaded.
  const posView = useTableView("stock-positions", POS_COLS);
  const txnView = useTableView("stock-txns", STOCK_TXN_COLS);
  /**
   * HOW THIS NAME IS HELD, not just what it is.
   *
   * The family opened this page on Jammu Kashmir Bank, read the asset class as
   * "direct equity", and saw two lines below that Carnelian manages it. The
   * page was contradicting itself: the shares are equity — that part was never
   * wrong — but nothing said the family did not choose them.
   *
   * One name can be held both ways at once (Onesource sits in a mandate and in
   * a demat), so the routes are collected across the rows and every one of them
   * is stated rather than the first. They ride in the bucket chip's hover now
   * rather than on a second chip beside it: for every holding in this book the
   * bucket already names the route — Direct Equity is the family's own account,
   * PMS mandates is a manager's, a fund's class is a fund vehicle — and the
   * Position tab states it again on every account row.
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
   * THE MANDATES THIS NAME SITS INSIDE, for the line under the name and the
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
   * WHAT THE MANDATE ROWS ACTUALLY ARE — because the mandate chip's tooltip
   * names a NOUN, and a typed noun is a claim.
   *
   * `holdingBucket` puts a mandate's WHOLE account in the mandate bucket, cash
   * sleeve included, and that is deliberate: the mandate is worth what its own
   * statement says it is worth. So 18 of this book's mandate-held rows are not
   * shares at all — ₹9.51 Cr of `Cash` across the ten mandates, plus Cash
   * Rec/Payable, a liquid sweep and a TDS receivable — and the mandate page
   * links every one of them to `/stock/<securityKey>`. Arriving here from that
   * link, a hardcoded "the family owns these shares" describes a ₹9.51 Cr
   * balance as shares, on the same screen whose research tab says in as many
   * words that this holding is a balance and not a share in a company.
   *
   * So the noun is DERIVED from the rows the tooltip actually covers — the
   * mandate-held subset, not the page's first row and not its asset class.
   *
   * THE LINE UNDER THE NAME NO LONGER NAMES ONE AT ALL. It used to read "— the
   * family owns these shares and the manager decides them: … Every other holding
   * in that mandate is on its own page", which was two sentences of explanation
   * above the figures on every visit. It names the mandate and links to it now;
   * a sentence that asserts no noun cannot assert the wrong one.
   */
  const mandateRows = useMemo(
    () => rows.filter((r) => isMandateHeld(engagementOf(accIdx, r) || null)),
    [rows, accIdx]);
  /**
   * ── THE SECTOR, ON THE SAME THREE TIERS SECTOR COMPOSITION USES ──────────
   *
   * The chip read `rows[0].sector` — the family's own statement and nothing
   * else — and a depository statement prints an ISIN, a quantity and a rate and
   * NO industry at all. So every company the family bought in its own demat
   * carried an "Unclassified" chip here (Clean Max, in the family's own
   * screenshot of this page) while Sector Composition, Family & Entities and the
   * Portfolio Monitor's stock axis all placed the same company. One screen
   * contradicting three others about one company is what `companySectorIndex`
   * exists to prevent, so this reads it: a PROJECTION of `companyExposure`,
   * never a second resolver, and the lower two tiers only ever FILL an empty
   * sector — a statement that printed one keeps it.
   *
   * OVER EVERY COMPANY SHARE AND NOT `currentHoldings(...)`, for the reason
   * Family & Entities records: a company's sector does not depend on how much of
   * it the family holds.
   *
   * ── AND THE SAME LOOK-THROUGH ANSWERS "WHICH OF MY FUNDS HOLD THIS" ────────
   *
   * A fund's own page answers "what does this fund hold" (its Research tab); a
   * COMPANY's page is where "which of my funds hold THIS" belongs, and it is the
   * half the family found missing — the Position table's Mutual funds route. So
   * the look-through is asked for on every COMPANY page: one the statements
   * report, or an address they carry no row for, which is what a company held
   * ONLY inside the family's funds looks like from here — the Portfolio
   * Monitor's stock axis links every one of those to this route. A fund folio or
   * a cash line never pays for the fetch.
   *
   * `useStockExposure` is the one place the look-through's three inputs are
   * assembled — the Monitor's stock axis and Sector Composition call it too — so
   * the figure this table prints for a fund is the figure those pages do, and
   * the sector chip above reads the SAME answer rather than a second fetch.
   */
  const bookSector = rows.find((r) => r.sector && r.sector !== UNCLASSIFIED)?.sector ?? null;
  /**
   * WHAT A STATEMENT RECORDS HERE AND NOTHING VALUES (Stage 10cz) — a demat
   * line whose only price was its last depository movement, a par row, a unit
   * count. The family holds them and no row of the live book carries them, so a
   * page with one is never "fully exited". `recordedHoldings.ts` files each
   * under the company the live layer would file it under once priced.
   */
  const recorded = useMemo(() => recordedFor(securityKey, portfolio?.positions ?? []), [securityKey, portfolio]);
  const recordedOnly = rows.length === 0 && recorded.length > 0;
  const recordedUnits = recorded.reduce((a, l) => a + l.quantity, 0);
  /** A unit count as its statement prints it — a fund's fractional units are not rounded away. */
  const unitsText = (n: number) => fmtNum(n, Number.isInteger(n) ? 0 : 3);
  const isCompanyPage = (rows.length === 0 && recorded.length === 0)
    || ![...rows, ...recorded].every((r) => isFundVehicle({ assetClass: r.assetClass ?? "" }) || r.assetClass === "Cash");
  const exposure = useStockExposure(consolidated, isCompanyPage);
  /**
   * ── A COMPANY THE FAMILY HOLDS ONLY INSIDE ITS FUNDS ───────────────────────
   *
   * No statement reports it, so there is no row — and this page read "no row"
   * as "Position closed · This name is fully exited", about a company the
   * family never held directly and still holds today through its funds. The
   * Portfolio Monitor's stock axis links every such company here.
   *
   * THREE STATES, NOT TWO. Until the look-through has answered, a page with no
   * row cannot tell a fund-held company from an exited one, and printing either
   * would be a claim made before anything was read — so it says it is checking.
   * And where the look-through did not load at all (`unchecked`) the page cannot
   * say "fully exited" either — the funds might hold it — so it says the one
   * thing it knows and names what it could not check.
   */
  const fundHit = exposure.status === "ok" ? exposure.byKey.get(securityKey) : undefined;
  const noBookRows = rows.length === 0 && recorded.length === 0;
  const fundOnly = noBookRows && !!fundHit && fundHit.total > 0;
  const resolving = noBookRows && exposure.status === "loading";
  const unchecked = noBookRows && exposure.status === "unreachable";
  // The sector chip reads the look-through's answer where the statements print
  // none: a company share with no printed sector, or a company only a fund
  // holds, whose sector is whatever its funds' filings agree on.
  const sectorWanted = (rows.length > 0 && rows.every(isCompanyShare) && bookSector === null) || fundOnly;
  const placed = useMemo(() => (sectorWanted && exposure.status !== "loading"
    ? companySectorIndex(consolidated.filter(isCompanyShare), exposure).get(securityKey) ?? null
    : null), [sectorWanted, exposure, consolidated, securityKey]);
  if (!portfolio) return null;
  // A key a recorded line stands under by its own spelling opens the company it
  // is filed under — one company, one page (Clean Max on a demat and on the
  // NSDL account; NSE's shares on two).
  const home = homeKeyOf(securityKey);
  if (rows.length === 0 && home !== securityKey) {
    return <Navigate to={`/stock/${encodeURIComponent(home)}${window.location.search}`} replace />;
  }

  const recordedHead = recorded.find((l) => l.securityKey === securityKey) ?? recorded[0];
  const name = rows[0]?.security ?? (recordedHead ? securityLabel(securityKey, recordedHead.security) : undefined) ?? fundHit?.name ?? led?.name ?? securityKey;
  /**
   * A FUND UNIT IS NOT A COMPANY, AND THIS PAGE MUST NOT RESEARCH IT AS ONE.
   *
   * The route is `/stock/:securityKey` and it serves every holding, which is
   * right — an AIF folio's quantity, cost, entities and dated ledger all belong
   * on a page of their own. What does not belong is the company research: a
   * returns table, ratios, screener's financials, concalls and insider trades,
   * each rendering its own "nothing came back" state for a holding that HAS no
   * company behind it. Those tabs state the absence ONCE, by decision, rather
   * than drawing five dashed boxes that read as five failed feeds.
   *
   * This is decided by the asset class rather than by the ticker being null: a
   * company whose NSE symbol this book could not resolve is a resolver shortfall
   * and keeps its research, because a future `build-symbols` fills it. A fund
   * never will.
   *
   * CASH IS IN THE SAME SET AND `Unlisted` IS NOT. A cash line and a liquid
   * sweep have no company behind them either. An unlisted COMPANY does — it is
   * a company whose figures nobody publishes, which is a data gap the research
   * tab is right to report as one.
   */
  const assetClass = rows[0]?.assetClass ?? recordedHead?.assetClass ?? null;
  const mandateAllShares = mandateRows.length > 0 && mandateRows.every(isCompanyShare);
  const mandateNoShares = mandateRows.length > 0 && !mandateRows.some(isCompanyShare);
  /** Where none of them is a share and they are all ONE class, the tooltip can
   *  name that class instead of reaching for a generic noun. Mixed classes fall
   *  back to the neutral wording rather than picking one to speak for the rest. */
  const mandateClass = mandateNoShares && new Set(mandateRows.map((r) => r.assetClass)).size === 1
    ? assetClassLabel(mandateRows[0].assetClass)
    : null;
  /** The mandate bucket's tooltip: "Company shares, held under a discretionary
   *  mandate" is true of Jammu & Kashmir Bank and false of the cash sleeve
   *  sitting in the same bucket by design. */
  const mandateBucketTip = mandateAllShares
    ? "Company shares, held under a discretionary mandate. The holdings tables file them under the manager who chose them, not with the shares the family bought itself."
    : mandateNoShares
      ? `${mandateClass ?? "Not a company share"} — held inside a discretionary mandate. The holdings tables file a mandate's WHOLE account under its manager, the balances beside the shares included, so the mandate's total ties to the statement it came from. That is why this sits under ${MANDATE_BUCKET} rather than under its own class.`
      : `Held inside a discretionary mandate. The holdings tables file a mandate's whole account under its manager — the shares it holds and the balances beside them — rather than splitting one statement across classes.`;
  /** How this name came to be held, in words, for every route its rows take. */
  const routeTip = routes
    .map(([k]) => `Held via ${ROUTE_LABEL[k as keyof typeof ROUTE_LABEL]} — ${ROUTE_NOTE[k as keyof typeof ROUTE_NOTE]}.`)
    .join(" ");
  /** What one unit of this holding IS, for the Quantity tile's caption. */
  const qtyNoun = assetClass === "Cash" ? "balance"
    : assetClass === "Equity" || assetClass === "Unlisted" ? "shares held"
    : assetClass ? "units held"
    : "held";
  /**
   * WHAT THE HOLDING IS, READ OFF ITS OWN LINES (Stage 10cz) — the statement
   * rows where there are any, else the lines a statement records and nothing
   * values. DSP's Gold ETF is an ETF whether or not its NAV cleared the basis
   * gate: read off valued rows alone, a page holding none was drawn as a
   * company, with a company price card and company research under an ETF's name.
   */
  const subject: Array<{ assetClass: string; securityKey: string; isin?: string | null }> = rows.length > 0
    ? rows
    : recorded.map((l) => ({ assetClass: l.assetClass ?? "", securityKey: l.securityKey, isin: l.isin }));
  const notACompany = subject.length > 0 && subject.every((r) => isFundVehicle(r) || r.assetClass === "Cash");
  const fundVehicle = subject.length > 0 && subject.every(isFundVehicle);
  /**
   * A LIQUID OR ARBITRAGE FUND IS CASH ON THIS PAGE TOO. The family's rule is
   * that such a fund is classified as nothing but cash, so the Research tab says
   * Cash rather than the wrapper its statement typed it as — and an arbitrage
   * fund is not looked through at all: its disclosed long shares are hedged by
   * short futures, and reading them as exposure would print stock the family
   * does not carry.
   */
  const cashFund = fundVehicle && subject.every((r) => isCashEquivalent(r));
  const arbitrage = subject.some((r) => isArbitrageFund(r));
  // A mutual fund or an ETF discloses its portfolio monthly and has a published
  // NAV; an AIF does neither. The one test, so the two tabs a scheme fills and
  // the note that refers to them cannot disagree about which schemes they are.
  const schemeHalves = fundVehicle && canHaveLookthrough(subject[0]);
  /**
   * AN ARBITRAGE FUND KEEPS ITS PRICE HALF AND LOSES ITS HOLDINGS HALF. The
   * reason it is not looked through is about what it HOLDS — long shares
   * hedged by short futures — and says nothing against the scheme's own
   * published NAV and returns, which are a statement about the fund rather than
   * about anything inside it. When the two halves were one card the whole card
   * had to go; on two tabs only the half the reason is about does.
   */
  const lookThroughHoldings = schemeHalves && !arbitrage;
  const notACompanyLabel = NOT_A_COMPANY_LABEL[assetClass ?? ""] ?? "this holding";
  const providerSector = rows.find((r) => r.providerSector)?.providerSector ?? null;
  // A fund-held company carries the ISIN its funds' filings print — a third
  // party's identifier, which only ever fills an absence.
  const isin = rows[0]?.isin ?? recordedHead?.isin ?? (fundOnly ? fundHit?.isin ?? undefined : undefined);
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
   * The custodian is NAMED rather than described, and the claim is scoped to
   * THIS holding — `providerOf` reads the account registry, so nothing here
   * infers a custodian from a security name (§2), and the sentence stays true
   * for an account that reports cost on its other rows but not this one.
   */
  const costWhy = (() => {
    // No rows at all is a name no statement now holds — there is no cost to
    // miss, and "no statement reports a cost" would send a reader looking.
    if (drows.length === 0) return recordedOnly ? "no statement reports a cost for it"
      : unchecked ? "no direct holding" : "no current holding";
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
  /* The Price & returns and Research tabs are keyed on that symbol. On a no-row
     page without one they would each render "no NSE symbol" — about a company
     the family holds through its funds, or before the look-through has even
     said whether it does. So they wait while it resolves, and a funds-only
     company gets ONE sentence on each saying why instead of empty panels. */
  const researchHeld = noBookRows && !sym && (fundOnly || resolving);
  const researchAbsent = fundOnly && !sym;
  const live = drows.length > 0 && drows.every((r) => r.live);
  const dayPct = live ? rows[0]?.dayChangePct ?? null : null;
  const dayChange = sum(drows.map((r) => r.dayChange ?? 0));
  /**
   * WHY THIS HOLDING IS NOT ON A LIVE PRICE — ONE ANSWER, read by the price
   * tile's line and its hover (`priceNote`), so the two cannot disagree. The
   * day's move is on that tile too since the Change today tile was folded in.
   *
   * The corporate-action layer withholds a quote that DID arrive wherever
   * pairing it with the statement's share count could be wrong — a buyback,
   * sales recorded after the statement, a capture that does not reach the
   * quote's day, or its evidence still loading — and this page said "the price
   * feed returned no quote" over every one of them (DL-9), which sends a reader
   * to wait for a feed that already answered. `liveWithheldReason` is the
   * gate's own sentence, the one place its words live.
   *
   * THE CAUSE PICKS THE WORDS, IN THIS ORDER: a name with no NSE symbol can
   * never go live, so that is said even while prices are loading; a quote held
   * back is said before "fetching", because it has already arrived.
   */
  const withheld = [...new Set(rows
    .map((r) => liveWithheldReason(r, corporateActionReturns))
    .filter((x): x is string => !!x))];
  const notLiveWhy = !sym ? "no NSE symbol resolves for this name, so it cannot be priced live"
    : withheld.length ? `a live quote arrived and is held back: ${withheld.join("; ")}`
    : quotesStatus === "loading" ? "fetching the live price…"
    : quotesStatus === "unavailable" ? "the price feed did not respond"
    : `the price feed returned no quote for ${sym}`;
  /**
   * PER-OWNER, SO THE RAW ROWS. This counted `drows` and reported "Held in 1
   * entity" for 360 ONE Special Opportunities — a holding reported on Ajay's
   * CRN37702 and Bharat's CRN60117, whose own "Position by account" table
   * listed both of them. The pill and the table contradicted each other on one
   * screen.
   *
   * It is the §"consolidated counts once, per-account does not" rule: the
   * CONSOLIDATED value below is right to dedupe, and a count of the entities
   * that report this name is not a consolidated figure — it is the answer to
   * "whose statements is this on", and the answer is two.
   *
   * AND AN ENTITY IS A MEMBER, NOT AN ACCOUNT. The count above was of ACCOUNTS
   * under the word "entities", so the family's Cash read "Held in 12 entities"
   * over three members, and State Bank of India "4" where the Portfolio
   * Monitor's own Entities column says 2. The pill counts the MEMBERS whose
   * statements carry the name — `ownerId`, the registry's one identity per
   * person or trust — and names the account count beside it wherever the two
   * differ, since "which statements" is still a real question. An account the
   * registry attributes to nobody counts as its own entity rather than
   * vanishing into another's.
   */
  // A recorded line is an account that holds it, valued or not.
  const heldAccounts = new Set([...rows, ...recorded].map((r) => r.accountId)).size;
  const heldOwners = new Set([...rows, ...recorded].map((r) => accIdx.get(r.accountId)?.ownerId ?? `account:${r.accountId}`)).size;
  // NO ROW IS NOT THE SAME AS EXITED — see `fundOnly` above.
  const exited = heldAccounts === 0 && !fundOnly && !resolving && recorded.length === 0;
  /** Why a recorded line carries no value — each line's own reason, as the book generated it. */
  const RECORDED_TIP = recorded.length
    ? `${recorded.length === 1 ? "A statement records" : `${recorded.length} statements record`} ${unitsText(recordedUnits)} units here and none prints a price this book may use — ${recorded.map((l) => l.reason).join("; ")}. A line is valued on the live basis once a quote or a published NAV answers.`
    : "";
  /**
   * What the account rows carry that the (consolidated) footer beneath them does
   * not. Non-zero only where this name is reported under more than one member,
   * and named under the table so a reader who adds the rows and gets a bigger
   * number than the Total can see why. Derived from the two sets, never typed.
   */

  const price = (n: number | null | undefined) =>
    (typeof n === "number" && Number.isFinite(n) ? fmtCurrency(convertFromBase(n), displayCurrency) : "—");
  const money = (n: number | null | undefined, sign?: boolean) => fmtFromBase(n, { compact: true, sign });
  /**
   * THE BOOK'S REALISED, over the rows this page counts (each dedupeGroup
   * once) — the field `build-book` strikes by FIFO up to each statement's date.
   * `realizedLotsAfter` counts the sales a capital gain statement dates AFTER
   * the holding's own statement: those units are still in it at its mark, so
   * their gain is not in this figure, and the tile says so.
   */
  const rt = realisedTile(drows, led === undefined ? undefined : led?.realizedProfit ?? null);
  const realised = rt.value;
  const lotsAfterRow = drows.find((r) => (r.realizedLotsAfter ?? 0) > 0) ?? null;
  const lotsAfterDate = lotsAfterRow ? accIdx.get(lotsAfterRow.accountId)?.asOf ?? null : null;
  /**
   * A REALISED STRUCK ON SOME OF THE ACCOUNTS SAYS HOW MANY. State Bank of
   * India's tile read "₹0 booked on units sold" over five accounts, two of which
   * issue a capital gain statement and sold nothing, and three of which issue
   * none — a figure for two accounts reading as the holding's, and a claim about
   * sales that did not happen. The count goes on the face, the accounts with no
   * statement in the hover, and a zero where nothing was sold says so.
   */
  const realisedCover = rt.basis === "book" && realised != null && rt.covered < rt.accounts
    ? ` · on ${rt.covered} of ${rt.accounts} accounts` : "";
  const uncoveredNames = [...new Set(drows
    .filter((r) => !(typeof r.realizedPnL === "number" && Number.isFinite(r.realizedPnL)))
    .map((r) => providerOf(accIdx, r)).filter(Boolean))];
  const realisedCoverWhy = realisedCover
    ? ` No capital gain statement covers the other ${rt.accounts - rt.covered} account${rt.accounts - rt.covered === 1 ? "" : "s"} that hold it${uncoveredNames.length ? ` (${uncoveredNames.join(", ")})` : ""}, so what their sales realised is not reported — and it is not counted here as zero.`
    : "";
  const realisedNothingWhy = rt.nothingSold
    ? " Nothing was sold in the accounts that report one, so the figure is a measured zero."
    : "";
  // THE CAUSE PICKS THE WORDS. An exited name's figure comes from the dated
  // record, so a record that did not load is said as that — never as "no
  // statement covers it", which is a claim about the book.
  const realisedNote = rt.basis === "statements"
    ? led === undefined ? "loading the capital gain statements…"
      : led === null ? "the dated record did not load"
      : realised == null ? "no capital gain statement covers this name"
      : "booked on exits · from the capital gain statements"
    : rt.lotsAfter > 0
      ? `${rt.lotsAfter} sale${rt.lotsAfter === 1 ? "" : "s"} after ${fmtDate(lotsAfterDate ?? "")} not counted`
    : rt.unreconciled != null ? `the capital gain statements record ${money(rt.unreconciled, true)} on this name — not in this figure`
    : realised == null ? "no capital gain statement covers the accounts that hold it"
    : rt.source === "unit-record" ? `from the fund's dated redemption record · FIFO${realisedCover}`
    // Kept under ten small words so the line stays a figure's note (#95).
    : rt.source === "mixed" ? (realisedCover ? `booked on units sold · FIFO · two records${realisedCover}` : "booked on units sold · FIFO · statements and the fund's own record")
    : rt.nothingSold ? `nothing sold · FIFO${realisedCover}`
    : `booked on units sold · FIFO${realisedCover}`;
  const realisedWhy = rt.basis === "statements"
    ? "No statement in this book reports a current holding in this name, so the capital gain statements' own lots are the only record of what its sales realised — and no units are shown as held that they could be counted against twice."
    : rt.lotsAfter > 0 && lotsAfterRow ? realisedReason(lotsAfterRow)
    : rt.unreconciled != null
      ? `The book strikes each holding's realised gain from its own account's capital gain statement, by FIFO, up to that statement's date — the figure the FIFO return beside it includes. The statements' lots for this name total ${money(rt.unreconciled, true)} and the holdings carry ${realised == null ? "none" : money(realised, true)}: a lot that does not join the holding it was sold from (a statement spelling the security differently), or one sold in an account that no longer holds it. The Capital Gains page lists every lot.`
    : realised == null ? realisedReason(drows[0])
    : rt.source === "unit-record"
      ? "No capital gain statement covers this holding: the fund bought its units back, and the gain is FIFO over the fund's own dated record of every allotment and redemption — the oldest units first — against what was paid for them. The FIFO return beside it includes it."
    : rt.source === "mixed"
      ? "The realised gain on units already sold, by FIFO — the oldest units first. Where an account issues a capital gain statement the book strikes it from that statement up to its date; where a fund bought its units back, from the fund's own dated redemption record. The FIFO return beside it includes it."
    : "The realised gain on units already sold, by FIFO — the oldest units first — as the book strikes it from each account's capital gain statement up to that statement's date. The FIFO return beside it includes it.";
  const realisedTip = realised != null && rt.basis === "book" && rt.lotsAfter === 0 && rt.unreconciled == null
    ? `${realisedWhy}${realisedNothingWhy}${realisedCoverWhy}` : realisedWhy;
  /**
   * A COST CARRIED THROUGH A FUND'S CLASS SWITCH, and the figure the fund's own
   * statement prints instead. This is the page a reader opens with that
   * statement in hand, so the two must be told apart here in the same words the
   * Portfolio Monitor uses — `carriedCostNote` is the one place they are chosen.
   */
  const carried = cost === null ? null : carriedCostOf(drows, BOOK_POSITION_TRANCHES);
  const carriedWhy = carried ? carriedCostNote(carried, (v) => money(v)) : "";
  /** …and a cost on the gross-paid basis, the Monitor's words again (VD-24). */
  const gross = cost === null || carried ? null : grossPaidOf(drows);
  const grossWhy = gross ? grossPaidNote(gross, (v) => fmtFromBase(v)) : "";

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
   * So the page does not choose. Where every statement's mark renders as ONE
   * figure it is shown; where they do not, the price tile states that and sends
   * the reader to the per-account table, which prints each mark beside the
   * statement it came from. **The test is what the RENDERER can distinguish**,
   * not an invented tolerance: two marks the page would print identically are
   * one figure as far as a reader is concerned, and two it prints differently
   * are genuinely two.
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
  /**
   * ── THE PRICE TILE: THE MARK, WHAT IT IS, AND TODAY'S MOVE ─────────────────
   *
   * It was two things in two places: a 2xl figure at the header's right with a
   * sentence under it, and a "Change today" tile at the far end of the strip.
   * A price and the day's move on it are one reading, so they are one tile —
   * the figure, the move beside it where a live quote carries one, and a short
   * line saying WHICH mark this is. The header's right-hand end is where the
   * tabs sit now, exactly as on Morning CIO.
   *
   * WHY THIS IS FIVE STATES AND NOT TWO. It read `live ? "live" : "no live
   * quote"` once, so a page still loading asserted the security had no live
   * quote while the top bar said "Fetching prices…". A split mark, a holding
   * reported at a total value, a published NAV, a live quote and a statement
   * mark are different facts, and each gets its own line — with the full
   * sentence in the hover, since a tile is not the place for a paragraph.
   *
   * A NAV's move is NOT the tile's delta arrow. It is the scheme's move on its
   * own publication date, against the NAV before it, and an arrow beside a price
   * reads as today's move — the defect the index strip once had, where one
   * session was differenced against itself. It is in the line, with its date.
   */
  const markedRow = rows.find((r) => r.currentPrice != null);
  const markDate = markedRow ? accIdx.get(markedRow.accountId)?.asOf ?? portfolio.asOf : portfolio.asOf;
  /**
   * THE DAY THE MARK IS PRICED, where the statement prices its balances on
   * another day (VD-17): ICICI's NSDL statement counts shares at 31 Mar 2026
   * and values them "Prices as on 30-Mar-2026". The line gives the pricing day
   * — the one the price is of — and the hover names both.
   */
  const markPriced = markedRow?.priceAsOf && markedRow.priceAsOf !== markDate ? markedRow.priceAsOf : null;
  const markLineDate = markPriced ? fmtDate(markPriced) : markDate;
  const markPricedClause = markPriced ? `, at its ${fmtDate(markPriced)} prices` : "";
  const priceNote: { line: string; tip: string } = exited
    ? unchecked
      ? { line: "no direct holding", tip: "No statement in this book reports a current holding in this name, so none marks it today — and whether your funds hold it could not be checked." }
      : { line: "no current holding", tip: "This name is fully exited, so no statement marks it today." }
    : recordedOnly
    ? { line: "not valued", tip: RECORDED_TIP }
    : cmpSplit
    ? {
        line: `statements do not agree — ${cmpMarks.join(" and ")}`,
        tip: `The statements reporting this holding do not agree on a mark — ${cmpMarks.join(" and ")}, ${
          cmpDates.length > 1 ? `drawn ${cmpDates[0]} to ${cmpDates[cmpDates.length - 1]}` : `all drawn ${cmpDates[0] ?? portfolio.asOf}`
        }. No one price covers them, and a weighted mean of them is a figure no statement printed, so none is shown here. Each is beside its own statement on the Position tab.`,
      }
    : cmp === null
    ? {
        line: "no per-unit price in the book — valued as a total",
        tip: "The book carries this holding's value as a total and no price per unit, so there is no price to show. Its value is on the Position tab.",
      }
    : navMark
    ? {
        // A day the NAV did not move is a zero, and a zero takes no sign: `fmtPct`,
        // as the scheme card on Price & returns prints the same move.
        line: `AMFI NAV, ${navMark.date}${navMark.changePct == null ? "" : ` · ${fmtPct(navMark.changePct, { sign: true, decimals: 2 })} on its day`}`,
        tip: `AMFI's published NAV for ${navMark.scheme}, ${navMark.date}. A fund resolves no NSE trading symbol, so this is the industry's own daily NAV rather than an intraday quote — and its move is against the NAV before it, on its own date, not today's.${
          // NO STATEMENT PRICES THESE UNITS, so the tip says whose count they
          // are rather than implying a statement mark that the NAV replaced —
          // and which KIND of count, because a depository's closing balance
          // on an account with no holding statement and units a holding
          // statement records with no rate are two different reasons (A-17).
          rows.some((r) => r.depositoryUnits)
            ? ` ${rows.every((r) => r.depositoryUnits) ? "These units are" : "Some units here are"} ${depositoryUnitsGist(rows)}, so no statement prices them.`
            : ""}`,
      }
    : live
    ? {
        line: `live${sym ? ` · ${sym}` : ""} · ${money(dayChange, true)} today`,
        tip: `The live price${sym ? ` for ${sym}` : ""}. The day's move is against the previous session's close, and is ${money(dayChange, true)} on this holding.`,
      }
    : assetClass === "Cash"
    ? {
        line: `a balance, as the statement of ${markDate} prints it`,
        tip: `A cash line is a balance, not a traded security, so it has no market price and no live quote. This is the per-unit figure the statement of ${markDate} prints against it.`,
      }
    : fundVehicle
    ? {
        // A FUND WITH NO PUBLISHED DAILY NAV — an AIF, or a scheme AMFI's file
        // did not price. "No NSE symbol" is true of it and beside the point: no
        // fund was ever going to have an intraday quote, so the line says whose
        // NAV this is instead of why a quote is missing.
        line: `the NAV on the statement of ${markDate}${markPriced ? `, priced ${markLineDate}` : ""}`,
        tip: `The NAV the manager struck, as the statement of ${markDate} prints it${markPricedClause}. A fund resolves no NSE trading symbol, so it never carries a live quote — and this one has no daily NAV in AMFI's published file either.`,
      }
    : (() => {
        // WHY IT IS NOT LIVE, and the causes are different facts: a name with
        // no NSE symbol can NEVER go live, while a symbol whose quote did not
        // arrive is a feed shortfall that may resolve on a refresh. The LINE
        // is a few words so the strip stays one height; the hover says it in
        // full.
        //
        // AND A QUOTE THAT ARRIVED AND IS HELD BACK IS NOT "NO QUOTE" (DL-9).
        // The corporate-action gate withholds it where pairing it with the
        // statement's share count could be wrong; the gate's own sentence is
        // the hover (`notLiveWhy`, the one ordering of these causes), and it is
        // said before "fetching", because the quote has already arrived.
        const [short, why] = !sym ? ["no NSE symbol", "no NSE trading symbol resolves for this security, so it can never carry a live quote"]
          : withheld.length ? ["live quote held back", notLiveWhy]
          : quotesStatus === "loading" ? ["fetching live price…", "the live price is still being fetched"]
          : quotesStatus === "unavailable" ? ["price feed down", "the price feed did not respond"]
          : ["no live quote", `the price feed returned no quote for ${sym}`];
        return {
          line: `statement mark, ${markLineDate} · ${short}`,
          tip: `The mark the statement of ${markDate} prints${markPricedClause} — not a live quote, because ${why}.`,
        };
      })();
  // WHAT THE STATEMENT SAYS ABOUT THIS MARK AND THE MARK DOES NOT (VD-16,
  // VD-18): a pre-tax NAV, or units that are all pledged. A few words on the
  // line, the statement's sentence in the hover; no figure of its own.
  const markNote = statementNoteForSet(rows);
  const buys = (led?.txns ?? []).filter((t) => t.side === "Buy");
  const firstBought = buys.length ? buys[buys.length - 1].date : null;
  const lastAdded = buys.length ? buys[0].date : null;
  // Null when the long-term cost is unknown — the bar is hidden rather than
  // drawn at zero, which would read as "none of this is long-term".
  const ltPct = ltCost !== null && cost !== null && cost > 0 ? (ltCost / cost) * 100 : null;
  /** A recorded line's statement date is its own — the date its units are counted on. */
  const recordedAsOf = (l: RecordedLine) => l.asOf ?? accIdx.get(l.accountId)?.asOf ?? null;
  const holdingAsOf = rows[0] ? accIdx.get(rows[0].accountId)?.asOf ?? portfolio.asOf
    : (recordedHead && recordedAsOf(recordedHead)) || portfolio.asOf;
  /** The EARLIEST statement date behind this holding — what a change in a
   *  scheme's unit is compared with, since a statement drawn before the change
   *  counts the earlier unit (DSM-A2, `FundLookthrough`). */
  const statementAsOfEarliest = [...new Set([...rows.map((r) => accIdx.get(r.accountId)?.asOf), ...recorded.map(recordedAsOf)]
    .filter((d): d is string => !!d))].sort()[0] ?? null;
  /**
   * WHEN, AND BY WHAT, THE VALUE IS STRUCK (VD-17, DSM-C4). A holding the ICICI
   * NSDL statement marks is worth what it was on 31 March, and the Holding value
   * tile printed it undated beside figures the live feed moves every minute;
   * the fund card dated the family's holding by its statement while the value
   * it multiplied was AMFI's NAV of a later day. `holdingValuation` is the one
   * answer for both — the date `valueDateOf` gives each row, or none where the
   * rows are struck on different dates.
   */
  const valuation = holdingValuation(drows, (id) => accIdx.get(id)?.asOf, nowMs);

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
    // The statement's own mark, never `marketValue / quantity`: the price is a
    // PRIMITIVE here (§4b), and deriving it would publish a figure the document
    // does not. (The example this comment once gave — ICICI NFT NT 50 DP G, a
    // rate of 60.4 beside a value implying 60.4167 — was no mark at all: a
    // Motilal CDSL rate is the price of the holding's last depository
    // movement, and its value that price times the movement's units, Stage
    // 10cz.) An absent mark sorts LAST either way rather than as a zero.
    cmp: (r: Position) => r.currentPrice,
    invested: (r: Position) => r.costBasis,
    current: (r: Position) => r.marketValue,
    pnl: (r: Position) => r.unrealizedPnL,
    return: (r: Position) => r.returnPct,
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
    pnl: () => null, return: () => null,
  });

  /** One statement row, as the table has always drawn it. */
  /** A recorded line is keyed on its account like a row, for the registry's lookups. */
  const asRow = (l: RecordedLine) => ({ accountId: l.accountId }) as unknown as Position;
  const recordedRouteOf = (l: RecordedLine) => heldRouteOf(holdingRoute(engagementOf(accIdx, asRow(l)) || null));
  const recordedIn = (route: HeldRoute) => recorded.filter((l) => recordedRouteOf(l) === route);
  /**
   * A LINE A STATEMENT RECORDS AND NOTHING VALUES, as a row of the same table in
   * the same columns: whose it is, where, and the units. Every money cell is
   * absent with the line's own reason — never the last movement's price, which
   * is not a mark of the balance. `data-recorded-row`, never `data-account-row`:
   * it is not a measured position and no total counts it.
   */
  const recordedRow = (l: RecordedLine) => {
    const eng = engagementOf(accIdx, asRow(l)) || null;
    const route = holdingRoute(eng);
    const why = l.reason.charAt(0).toUpperCase() + l.reason.slice(1);
    return (
      <Tr view={posView} key={`rec-${l.accountId}-${l.securityKey}`} data-recorded-row={l.accountId}
        data-held-route={heldRouteOf(route)} data-recorded-units={l.quantity} className="hover:bg-ink-700/40">
        <td className="px-4 py-2.5 font-medium text-slate-100">{ownerOf(accIdx, asRow(l))}</td>
        <td className="max-w-[20rem] whitespace-normal px-4 py-2.5 text-[12px] text-slate-400">
          <div className="min-w-[12rem]">
            <div>{providerOf(accIdx, asRow(l))}</div>
            <div className="text-[10px] text-slate-600">
              <span title={`${eng || "engagement not stated"} — ${ROUTE_NOTE[route]}`}>via {ROUTE_LABEL[route]}</span>
            </div>
          </div>
        </td>
        <td className="mono px-4 py-2.5 text-right text-slate-200">{unitsText(l.quantity)}</td>
        <td className="px-4 py-2.5 text-right"><AbsentCell reason="No statement reports a cost for it." /></td>
        <td className="px-4 py-2.5 text-right"><AbsentCell reason={why} /></td>
        <td className="px-4 py-2.5 text-right"><AbsentCell reason="No statement reports a cost for it." /></td>
        <td className="px-4 py-2.5 text-right text-slate-500" title={why} data-recorded-value>not valued</td>
        <td className="px-4 py-2.5 text-right"><AbsentCell reason="Not valued, so no gain can be struck." /></td>
        <td className="px-4 py-2.5 text-right"><AbsentCell reason="Not valued, so no return can be struck." /></td>
      </Tr>
    );
  };
  const measuredRow = (r: Position) => {
    const eng = engagementOf(accIdx, r) || null;
    const route = holdingRoute(eng);
    // The account's dated capital where this row IS the whole account — the
    // XIRR line's only source; undefined on a holding inside one.
    const rowCap = datedCap?.behind([r], holdingsUniverse) ?? undefined;
    return (
      /* COUNTED STRUCTURALLY, NEVER BY LINE. `check:pages` used to count these
         rows by splitting the table's innerText on newlines, which works only
         while every cell is one line — and the MANAGED BY cell below carries a
         strategy sub-line whenever the account prints one. `data-held-route`
         is the route the row is filed under, read the same way. */
      <Tr view={posView} key={r.accountId} data-account-row={r.accountId} data-held-route={heldRouteOf(route)} className="hover:bg-ink-700/40">
        <td className="px-4 py-2.5 font-medium text-slate-100">{ownerOf(accIdx, r)}</td>
        {/* THE WIDEST TEXT IN THE TABLE MAY WRAP; A FIGURE MAY NOT. The table
            is `whitespace-nowrap` so figures never break, and a provider's
            legal name or a mandate's printed strategy ("V.E.C ASSAGO Small and
            Mid-Cap Growth") pushed the Return column past the card's edge. It
            wraps under a 20rem ceiling and above the same 12rem floor the fund
            lines keep, so a name held through a demat, a mandate and ten funds
            (State Bank of India) still fits its card. Stage 10cg reached this
            same cell for a second reason: where Inter cannot load, the fallback
            face's semibold headings run wider, and this sub-line is what gives
            up the width. */}
        <td className="max-w-[20rem] whitespace-normal px-4 py-2.5 text-[12px] text-slate-400">
          <div className="min-w-[12rem]">
            <div>{providerOf(accIdx, r)}</div>
            {/* The route reads as a phrase — "via manager's mandate" — because
                the column header no longer supplies the word. `ROUTE_LABEL` is
                still the one place those four words are chosen. */}
            <div className="text-[10px] text-slate-600" data-held-via>
              {strategyOf(accIdx, r) && !isMandateHeld(eng) && <>{strategyOf(accIdx, r)}{" · "}</>}
              <span title={`${eng || "engagement not stated"} — ${ROUTE_NOTE[route]}`}>
                via {ROUTE_LABEL[route]}
              </span>
              {/* THE ROW IS THE DOOR INTO THE MANDATE — the only place on the
                  page that can answer "what else is in there" per account,
                  which matters where one name is held under two different
                  mandates. */}
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
        {/* THE MARK, PER STATEMENT, WITH THE DATE IT WAS STRUCK. The date is
            the cell's own hover rather than a second column. Guarded before
            `price()`, which returns a BARE dash — an absence names its cause. */}
        <td className="px-4 py-2.5 text-right mono text-slate-400" data-cmp={r.currentPrice ?? ""}>
          {r.currentPrice === null
            ? <AbsentCell reason="the book carries this row's value as a total and no price per unit, so there is no mark to show" />
            : <span title={r.depositoryUnits && !r.navPriced
                /* A LISTED SHARE A DEPOSITORY REPORTS (Stage 10cy) has no NAV:
                   its price is the live quote, and the row exists only while
                   the feed prices it. Saying "AMFI's NAV" here would name a
                   source that never priced it. */
                ? `${price(r.currentPrice)} — the live quote. No statement prices these shares — they are ${describeDepositoryUnits(r.depositoryUnits, portfolio.accounts)} — so their value is those shares at this quote, shown only while the quote feed prices them.`
                : r.depositoryUnits
                /* NO STATEMENT MARKS THESE UNITS, so the sentence that says a
                   NAV "replaces" one would be false here. Which of the two
                   reasons applies is `describeDepositoryUnits`'s to say. */
                ? `${price(r.currentPrice)} — AMFI's published NAV for this scheme as of ${r.navDate}. No statement prices these units — they are ${describeDepositoryUnits(r.depositoryUnits, portfolio.accounts)} — and their value is those units at this NAV.`
                : r.navPriced
                ? `${price(r.currentPrice)} — AMFI's published NAV for this scheme as of ${r.navDate}, which is newer than the ${providerOf(accIdx, r)} statement's own mark and replaces it. Only the value moves: quantity, cost and every dated figure stay as the statement printed them.`
                : `Marked at ${price(r.currentPrice)} by the ${providerOf(accIdx, r)} statement${accIdx.get(r.accountId)?.asOf ? ` of ${accIdx.get(r.accountId)!.asOf}` : ""}${
                    // The day its prices are of, where the statement names one
                    // apart from its balances' (VD-17).
                    r.priceAsOf && r.priceAsOf !== accIdx.get(r.accountId)?.asOf ? `, at its ${fmtDate(r.priceAsOf)} prices` : ""}.`}
                data-cmp-priced={r.priceAsOf && r.priceAsOf !== accIdx.get(r.accountId)?.asOf ? r.priceAsOf : undefined}>
                {price(r.currentPrice)}
              </span>}
        </td>
        <td className="px-4 py-2.5 text-right mono text-slate-400"
          data-cost-carried={r.costBasisSource === "carried-through-switch" ? (r.costBasis ?? undefined) : undefined}
          data-cost-printed={r.costBasisSource === "carried-through-switch" ? r.printedCostBasis : undefined}
          data-cost-gross={r.costBasisSource === "gross-paid" ? (r.costBasis ?? undefined) : undefined}
          data-cost-gross-printed={r.costBasisSource === "gross-paid" ? r.printedCostBasis : undefined}>
          {r.costBasisSource === "carried-through-switch"
            ? <span title={carriedCostNote(carriedCostOf([r], BOOK_POSITION_TRANCHES)!, (v) => money(v))}>{money(r.costBasis)}</span>
            : r.costBasisSource === "gross-paid"
            ? <span title={grossPaidNote(grossPaidOf([r])!, (v) => fmtFromBase(v))}>{money(r.costBasis)}</span>
            : r.costBasis === null
            /* `money()` returns a BARE dash for a null, and §2 forbids one
               (DSM-D4): the row names whose statement reports no cost. */
            ? <AbsentCell reason={`no cost on the ${providerOf(accIdx, r)} statement for this holding`} />
            : money(r.costBasis)}
        </td>
        <td className="px-4 py-2.5 text-right mono text-slate-200">{money(r.marketValue)}</td>
        <td className={`px-4 py-2.5 text-right mono ${changeColor(r.unrealizedPnL)}`}>
          {r.unrealizedPnL === null
            ? <AbsentCell reason={r.costBasis === null
                ? `needs a cost — no cost on the ${providerOf(accIdx, r)} statement for this holding`
                : "the statement reports no unrealised figure for this holding"} />
            : money(r.unrealizedPnL, true)}
        </td>
        {/* WHICH RETURN, stated in the cell. `measuredReturn` is the one place
            the methodology lives (Stage 10af). */}
        <td className="px-4 py-2.5 text-right mono" data-stock-return
          data-capital={rowCap ? (rowCap.dated ? "dated" : "undated") : undefined}>
          <ReturnCells p={r} valuedAt={valueDateOf(r, accIdx.get(r.accountId)?.asOf, nowMs)} capital={rowCap} />
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
   * Market value heading as a figure a statement printed. The arithmetic behind
   * it — this member's holding of the fund, the fund's own disclosed weight, and
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
    const heldAsClass = l.classes.length ? ` (held as ${l.classes.join(" and ")})` : "";
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
      + `The fund's own filing${l.holdingsAsOf ? ` of ${l.holdingsAsOf}` : ""} puts ${weight} of the fund in ${name}${many}${heldAsClass}, `
      + `so ${owner}'s share is ${money(l.fundValue)} × ${weight} = ${money(l.value)}. `
      + `DERIVED, not a position: the family owns units of the fund and the fund owns ${owns}. It is no part of the book's own value — the fund's own value already stands for it there.`;
    return (
      <Tr view={posView} key={l.key} data-fund-line={l.fundKey} data-fund-line-account={l.accountId}
        data-fund-line-value={l.value} data-fund-line-pct={l.pctAum} data-fund-line-holding={l.fundValue}
        className="hover:bg-ink-700/40">
        <td className="px-4 py-2.5 font-medium text-slate-100">{owner}</td>
        {/* A FUND'S NAME MAY WRAP. Scheme names run to fifty-odd characters and
            this column is sized by its widest unbreakable cell, so the fund
            line wraps inside the width the statement rows already give it
            rather than widening the table. */}
        <td className="max-w-[20rem] whitespace-normal px-4 py-2.5 text-[12px] text-slate-400">
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
       column, and a table sizes a column to its widest cell — a long label and
       a wrapped sub-line under it widened that column and pushed Return off the
       card's right edge. So the band says the route in the tab's own words and
       carries its counts in its hover. */
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
      <td /><td />
    </Tr>
  );

  /** The fund route's absences and coverage, NAMED — never inferred from a row that is not there. */
  const fundNote = () => {
    if (fl.status !== "ok") return null;
    const aifValue = sum(fl.aif.map((a) => a.marketValue));
    /* ONE SHORT LINE, the working in its hover — the family asked for the notes
       around every table to go (Stage 10ci). What stays on screen is what a
       reader could otherwise get wrong: how many of the funds were read, and
       that the AIFs are NAMED as unknown rather than dropped, which would read
       as "they do not hold it". */
    const why = [
      "Each line is your holding of the fund × the share its whole monthly filing puts in this company — shares, bonds, NCDs and commercial paper alike.",
      fl.aif.length > 0 ? `An AIF files no portfolio this book can join, so whether your ${fl.aif.length} AIF holding${fl.aif.length === 1 ? "" : "s"} (${money(aifValue)}) hold it is not known — not no.` : "",
      fl.unread.length > 0 ? `Could not be read: ${fl.unread.map((u) => u.fundName).join(", ")}.` : "",
    ].filter(Boolean).join(" ");
    return (
      <tr key="fund-note" data-held-fund-note>
        <td colSpan={posView.order.length} className="whitespace-normal px-4 py-2 text-[11px] text-slate-500" title={why}>
          {fl.lines.length === 0
            ? <>None of the {fl.covered} fund holdings this book can read discloses it</>
            : <>Read across {fl.covered} of {fl.considered} fund holdings</>}
          {fl.aif.length > 0 && <span data-held-aif={fl.aif.length}> · {fl.aif.length} AIF holding{fl.aif.length === 1 ? "" : "s"} ({money(aifValue)}) not known</span>}
          {fl.unread.length > 0 && <> · {fl.unread.length} not read</>}
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
   * DRAWN ONLY OVER TWO OR MORE ROWS. A total of one row is the row again —
   * and the strip above already carries the same figures — so a route of one
   * statement draws its row and no measured total under it (the Polycab
   * table's rule). The derived and exposure lines are not that total and keep
   * their own rules.
   *
   * A BLENDED AVG COST IS ARITHMETIC; A BLENDED MARK IS AN INVENTION. The avg
   * cost is cost over the units that HAVE one (`measuredTotals`), and both of
   * those add across statements. Prices do not: a quantity-weighted mean of
   * ₹2,667.30 and ₹2,502.90 is a price no document struck, so the mark is shown
   * where every statement in the set agrees on one and refused where they do
   * not — the same resolution the price tile uses.
   *
   * AND THE RETURN IS FIFO OVER THE ROWS THAT REPORT A COST (Stage 10ca) — the
   * figure the Unrealised P&L tile prints, struck once in `measuredTotals` —
   * and where those rows are not every row, the Total row's own line says which
   * units it covers.
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
           over those units while Market value is over all of them. Said on the
           row, in words a reader sees, rather than only in three hovers. */
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
                ? <AbsentCell reason="the book carries no per-unit price for this holding — only its total value" />
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
            <td key="return" className={`px-4 py-2.5 text-right mono ${changeColor(t.costedReturn)}`}
              data-stock-foot-return data-held-foot-return={t.costedReturn ?? ""}
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

  /** The derived footer line: one figure, under Market value, saying what it is. */
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

  // ── WHAT THE ACTIVE ROUTE TAB DRAWS ──────────────────────────────────────────
  const measuredRoutes = (["direct", "manager", "other"] as const).filter((r) => ht.sections[r].lines > 0);
  const fundLinesShown = fl.status === "ok" && fl.lines.length > 0;
  /** Sections the All tab draws — a band is chrome, so only where there are two or more. */
  const allSections = HELD_ROUTES.filter((r) => (r === "fund" ? tabsShown && fundLinesShown
    : ht.sections[r].lines > 0 || recordedIn(r).length > 0));
  const bands = heldTab === "all" && allSections.length > 1;
  /** The statement rows on screen, for the "carry both, count once" note. */
  const visibleMeasured = heldTab === "all" ? rows
    : heldTab === "funds" ? [] : ht.sections[TAB_ROUTE[heldTab]].positions;
  const visibleDup = sum(visibleMeasured.map((r) => r.marketValue)) - sum(dedupedPositions([...visibleMeasured]).map((r) => r.marketValue));
  const measuredLabel = (routes: readonly HeldRoute[]) =>
    routes.length ? `Total · ${routes.map((r) => HELD_ROUTE_LABEL[r]).join(" + ")}` : "Total";
  const DERIVED_TITLE = "DERIVED, not a position: each fund's own monthly filing gives this company's weight in the fund, and the family's share is its holding of the fund times that weight. It is never added to the book's own value — the fund's value already stands for it there.";
  const EXPOSURE_TITLE = "Your statements' own figure plus your derived share inside your funds — the figure the Portfolio Monitor's security view calls Total exposure. It is not a book value: the derived half is already inside the funds' own values in the book.";
  /** Which footer rows the active route tab draws — ONE RULE FOR ALL THREE: a
   *  footer line is drawn only where it adds up two or more lines. The measured
   *  total needs two statement rows and the derived total two fund lines, since
   *  a total of one line is the line again; the exposure line spans both halves,
   *  so one of each is already two. */
  const measuredFootRows = heldTab === "all" ? rows
    : heldTab === "funds" ? [] : ht.sections[TAB_ROUTE[heldTab]].positions;
  const measuredFootShown = measuredFootRows.length > 1;
  const derivedFootShown = fundLinesShown && fl.status === "ok" && fl.lines.length > 1
    && ((heldTab === "all" && tabsShown) || heldTab === "funds");
  const exposureFootShown = heldTab === "all" && tabsShown && fundLinesShown && rows.length > 0 && ht.total !== null;

  /** Each route tab's figure and whether it has anything to open. */
  const tabInfo = (k: HeldTab): { text: string; value: number | null; lines: number; disabled: boolean; title: string } => {
    if (k === "all") {
      const lines = rows.length + recorded.length + (fl.status === "ok" ? fl.lines.length : 0);
      return {
        // A holding only a statement records, and no fund discloses, has no
        // figure at all — "₹0" would read as a measured holding of nothing.
        text: recordedOnly && !(fl.status === "ok" && fl.lines.length) ? "not valued"
          : ht.total !== null ? money(ht.total) : "", value: ht.total, lines, disabled: false,
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
    const sec = ht.sections[route];
    const rec = recordedIn(route);
    if (!sec.lines && rec.length) {
      return { text: "not valued", value: null, lines: rec.length, disabled: false,
        title: `${rec.length === 1 ? "A statement records" : `${rec.length} statements record`} ${name} here, and none prints a price this book may use for it.` };
    }
    return sec.lines
      ? { text: money(sec.value), value: sec.value, lines: sec.lines, disabled: false, title: `${HELD_ROUTE_NOTE[route]} ${sec.lines} account${sec.lines === 1 ? "" : "s"}.` }
      : { text: "none", value: 0, lines: 0, disabled: true,
          title: route === "direct" ? `No own demat or broking statement reports ${name} — the family holds none of it directly.`
            : route === "manager" ? `No PMS mandate statement reports ${name}.` : "No other account reports it." };
  };
  const heldTabs = tabsShown && (
    <div className="inline-flex shrink-0 flex-wrap items-center gap-0.5 rounded-md border border-ink-600 bg-ink-800/60 p-0.5"
      role="tablist" aria-label="How this is held" data-held-tabs>
      {HELD_TABS.filter((v) => v.key !== "other" || ht.sections.other.lines > 0 || recordedIn("other").length > 0).map((v) => {
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
  /**
   * WHILE THE LOOK-THROUGH IS STILL ANSWERING, A NO-ROW PAGE SAYS SO. It cannot
   * yet tell a company held only inside the funds from one the family has sold,
   * and printing either would be a claim made before anything was read; an
   * empty panel would read as a page that failed. A card that is loading says
   * so (Stage 10r's rule).
   */
  const resolvingNote = (
    <Card className="mt-5">
      <p className="text-sm text-slate-500" data-stock-resolving>
        Reading your funds&rsquo; monthly filings to see whether they hold {name}…
      </p>
    </Card>
  );

  /**
   * THE SECTOR CHIP, on the answer `placed` resolved above. Its three states are
   * distinct: still placing, placed by a named tier, and placed by none — and
   * only the last may say "Unclassified", because the first is not yet an
   * answer at all.
   */
  const sectorChip = (() => {
    // A CASH LINE HAS NO SECTOR. Its statement files it under a "Cash" heading,
    // and that word printed as a sector pill beside the Cash bucket said the
    // same thing twice while claiming a GICS sector nobody assigned.
    if (rows.length > 0 && rows.every((r) => r.assetClass === "Cash")) return null;
    if (fundVehicle) {
      return (
        <span className="text-[11px] text-slate-600" title="A GICS sector is a property of a company. This holding is a wrapper over many of them and no statement here prints a sector for it.">
          no sector — a fund holds many
        </span>
      );
    }
    if (bookSector) {
      return (
        <Pill tone="info">
          <span data-stock-sector="book" title={`${bookSector} — ${SECTOR_FROM.book}${providerSector && providerSector !== bookSector ? ` (printed as "${providerSector}")` : ""}.`}>{bookSector}</span>
        </Pill>
      );
    }
    if (!sectorWanted) {
      const s = rows[0]?.sector;
      return s ? <Pill tone="info"><span data-stock-sector="book">{s}</span></Pill> : null;
    }
    if (exposure.status === "loading") {
      return <span className="text-[11px] text-slate-600" data-stock-sector="loading">placing the sector…</span>;
    }
    if (placed?.from && placed.sector && placed.sector !== UNCLASSIFIED) {
      return (
        <Pill tone="info">
          <span data-stock-sector={placed.from} title={`${placed.sector} — ${SECTOR_FROM[placed.from] ?? ""}. No statement in this book prints a sector for this company.`}>{placed.sector}</span>
        </Pill>
      );
    }
    return (
      <Pill>
        <span data-stock-sector="none" title="No statement in this book prints a sector for this company, no fund this family holds files one against its ISIN, and screener.in places it nowhere this book can join to.">{UNCLASSIFIED}</span>
      </Pill>
    );
  })();

  return (
    <div className="flex flex-col lg:h-full">
      {/* ── THE HEADER: CRUMB, NAME AND TABS, AND WHAT KIND OF HOLDING ──────
          THE CRUMB NAMES THE HOLDING, NOT THE ROUTE. It read "Stock Info" on
          every one of 213 names, which is a description of the page; and the
          three buttons replace "Back to holdings", a hardcoded step to the
          Portfolio Monitor that was wrong for every reader who arrived from
          Sector Composition, a mandate, a drill-down or the movers card.

          THE TABS ARE AT THE RIGHT-HAND END OF THE NAME'S LINE, as on Morning
          CIO, and KEYED `data-stock-tab-key` — a claim about which tabs this
          page offers must not be struck on labels a redesign is free to reword.
          The name is `text-xl` in the display face, every other page's headline
          (`PageHeader`), where it was `text-2xl` on this page alone. */}
      <div className="mb-3 shrink-0" data-stock-head>
        <PageNav className="mb-2" trail={[{ label: "Portfolio Monitor", to: "/monitor" }, { label: name }]} />
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2" data-stock-headline>
          <h1 className="font-display text-xl font-bold tracking-tight text-slate-100">{name}</h1>
          <div role="tablist" aria-label="Which part of this holding to show" data-stock-tabs
            className="inline-flex flex-wrap items-center gap-0.5 rounded-lg border border-ink-700 bg-ink-800/60 p-0.5">
            {STOCK_TABS.map((v) => (
              <button key={v.key} type="button" role="tab" aria-selected={tab === v.key}
                title={v.title} data-stock-tab-key={v.key}
                onClick={() => setTab(v.key)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  tab === v.key
                    ? "bg-champagne-500 text-ink-950 shadow-glow"
                    : "text-slate-400 hover:bg-ink-700/60 hover:text-slate-200"
                }`}>
                {v.label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {/* WHERE THIS HOLDING IS FILED, which for everything that is not a
              mandate-held share is still exactly its asset class — a fund's
              chip reads AIF, a cash line's reads Cash, and only a share a
              manager chose now reads the mandate bucket instead of a word that
              claims the family picked it. `bucketLabel` and the monitor's
              section headings come from the same function on purpose. HOW it
              came to be held rides in the same chip's hover (`routeTip`). */}
          {buckets.map(([k]) => (
            <Pill key={k} tone={k === MANDATE_BUCKET || k === DIRECT_EQUITY_BUCKET || k === UNROUTED_EQUITY_BUCKET ? "info" : "core"}>
              <span title={`${k === MANDATE_BUCKET
                ? mandateBucketTip
                : `How the holdings tables group this holding — ${bucketLabel(k)}.`} ${routeTip}`}>{bucketLabel(k)}</span>
            </Pill>
          ))}
          {sectorChip}
          {isin
            ? <span className="mono text-[11px] text-slate-500">{isin}</span>
            : !resolving && (() => {
                const w = isinAbsentWords(fundOnly, fundNavFor({ securityKey })?.isin ?? null);
                return <span className="text-[11px] text-slate-600" data-stock-isin-absent title={w.tip}>{w.text}</span>;
              })()}
          {sym && <span className="mono text-[11px] text-slate-500">{sym}</span>}
          {/* WHAT THE PILL CLAIMS DEPENDS ON WHICH OF THREE THINGS THIS IS, and
              while the look-through has not answered a no-row page cannot tell
              them apart — so it claims nothing rather than "Position closed". */}
          {fundOnly
            ? <Pill tone="info"><span data-stock-held="funds-only"
                title="No statement issued to this family reports this company, so there is no account, quantity or cost for it. The family holds it through the funds listed on the Position tab — derived from each fund's own monthly filing, and no part of the book's own value.">
                Held only inside your funds</span></Pill>
            : !resolving && <Pill>{unchecked ? "No direct holding" : exited ? "Position closed" : (
                // AN ENTITY IS A MEMBER, NOT AN ACCOUNT (DSM-A3) — see
                // `heldOwners`. The account count rides beside it wherever the
                // two differ, and what each counts is the hover.
                <span data-stock-owners={heldOwners} data-stock-accounts={heldAccounts}
                  title={heldAccounts === heldOwners
                    ? `${heldOwners === 1 ? "One member's statement reports" : `${heldOwners} members' statements report`} this holding — ${heldAccounts === 1 ? "one account" : `one account each`}.`
                    : `${heldOwners} ${heldOwners === 1 ? "member holds" : "members hold"} this across ${heldAccounts} accounts — an entity is a member of the family or a trust, and one member can hold a name in several accounts. Each account is a row of the Position table.`}>
                  {`Held in ${heldOwners} ${heldOwners === 1 ? "entity" : "entities"}`}{heldAccounts !== heldOwners ? ` · ${heldAccounts} accounts` : ""}
                </span>)}</Pill>}
          {/* ...AND THE OTHER ROUTE, BESIDE IT, where a company is held both
              ways: a reader who sees "Held in 3 entities" has otherwise no hint
              that ten funds hold it too until they open the table. */}
          {!fundOnly && ht.fundLines.status === "ok" && ht.fundLines.funds > 0 && (
            <Pill><span data-stock-held-funds={ht.fundLines.funds}
              title="Derived from each fund's own monthly filing — see the Mutual funds tab of the Position table. Never added to this holding's own value.">
              also inside {ht.fundLines.funds} of your funds</span></Pill>
          )}
        </div>
        {/* WHO CHOSE IT, UNDER THE NAME AND ON EVERY TAB. The family read this
            page top-to-bottom once and formed their belief from the chip before
            they reached the table that said a manager chose the share, so the
            mandate is named where the eye lands first — and linked, because "a
            manager chose this" with no way to see WHAT ELSE that manager chose
            is half an answer. One line now, where it was two sentences. */}
        {/* ONE LINE, NOT A PARAGRAPH. A name held under one or two mandates
            links each here; a cash sleeve sits in all ten of this book's
            mandates, and listing ten links under the name was a five-line wall
            above the figures. Beyond two it is a count, and every mandate is
            still one click away — each account row on the Position tab links
            to its own. */}
        {/* Beyond two, the count is the whole line: where each mandate is
            linked from is the line's hover (Stage 10cp), because "each linked
            from its row on the Position tab" is a sentence about the page, not
            a fact about the holding. */}
        {mandates.length > 0 && (
          <p className="mt-1.5 truncate text-[12px] text-slate-400" data-stock-mandates={mandates.length}
            title={[
              ...(mandates.length > 2 ? ["Each is linked from its own row on the Position tab:"] : []),
              ...mandates.map((m) => `${m.label}${m.label === m.provider ? "" : ` · ${m.provider}`} · ${m.owner}`),
            ].join("\n")}>
            {/* The sentence that explains the route is the hover on these first
                words (main's Stage 10ci). THE NOUN IS DERIVED, NOT TYPED — see
                `mandateAllShares` above: a mandate's bucket takes its whole
                account, so "these shares" would be printed over a cash sleeve
                and a TDS receivable as well as over a company. */}
            <span className="font-medium text-slate-300"
              title={`${mandateAllShares
                ? "The family owns these shares and the manager decides them."
                : mandateNoShares && mandateClass
                  ? `This is ${mandateClass} the mandate ${mandates.length === 1 ? "account holds" : "accounts hold"}, not a share the manager chose.`
                  : "The family owns these holdings and the manager runs the accounts they sit in."} Every other holding in ${mandates.length === 1 ? "that mandate is on its" : "those mandates is on their"} own page.`}>
              Held through {mandates.length === 1 ? "a discretionary mandate" : `${mandates.length} discretionary mandates`}</span>
            {mandates.length <= 2 && <>
              {" — "}
              {mandates.map((m, i) => (
                <span key={m.accountId}>
                  {i > 0 && "; "}
                  <Link to={`/mandate/${encodeURIComponent(m.accountId)}`} className="text-champagne-400 hover:underline" title="Open the mandate — every holding the manager runs inside it, and the statement it ties to">{m.label}</Link>
                  <span className="text-slate-500">{m.label === m.provider ? "" : ` · ${m.provider}`} · {m.owner}</span>
                </span>
              ))}
            </>}
          </p>
        )}
      </div>

      {/* ── THE KPI STRIP, THE SAME SIX TILES ON EVERY TAB ───────────────────
          …OF A HOLDING THE FAMILY'S OWN STATEMENTS REPORT. A company held only
          inside the funds has no quantity, cost or mark of its own, and six
          dashes (or worse, six zeros) over a page whose whole answer is the
          fund lines would read as a holding that is missing rather than one
          held another way (main's #88). While the look-through is still
          answering, a no-row page cannot yet tell which it is, so it draws no
          strip rather than one that may be wrong. */}
      {!fundOnly && !resolving && (
      <div className="grid shrink-0 gap-3 sm:grid-cols-3 xl:grid-cols-6" data-stock-strip>
        {/* AN EMPTY COLLECTION IS NOT A ZERO. A name reached from the dated
            ledger that no statement now holds has no rows at all, and summing
            nothing printed "₹0 · 0.0% of book" and "0 held" — a measurement
            nobody made. It is absent with its reason; a holding its fund
            redeemed to nil still HAS rows and keeps its measured zero. */}
        <Kpi label="Holding value"
          value={exited || recordedOnly ? <AbsentValue /> : fmtFromBase(mv, { compact: true })}
          sub={exited ? <span className="text-slate-500">{unchecked ? "no direct holding" : "no current holding — fully exited"}</span>
            : recordedOnly ? <span className="text-slate-500" title={RECORDED_TIP} data-stock-recorded-value>not valued</span>
            : <span data-stock-valued-at={valuation.at ?? ""} data-stock-valued-by={valuation.by ?? ""} title={valuation.why}>
                {weight.toFixed(1)}% of book{valuation.words ? ` · ${valuation.words}` : ""}</span>}
          icon={<Wallet className="h-4 w-4" />} />
        {/* THE SAME TYPED NOUN, ONE TILE OVER. `/stock/:securityKey` serves every
            holding, so "shares held" was printed under the quantity of an AIF
            folio's units and under a mandate's cash balance. It comes off the
            asset class the row carries, and an unstated class gets the noun that
            claims nothing. */}
        <Kpi label="Quantity"
          value={exited ? <AbsentValue /> : <span data-stock-qty={recordedOnly ? recordedUnits : qty}>{recordedOnly ? unitsText(recordedUnits) : fmtNum(qty)}</span>}
          sub={exited ? <span className="text-slate-500">{unchecked ? "no direct holding" : "no current holding"}</span>
            : recorded.length > 0
              ? <span title={RECORDED_TIP} data-stock-recorded-units={recordedUnits}>
                  {recordedOnly ? `${qtyNoun} · not valued` : `${qtyNoun} · +${unitsText(recordedUnits)} not valued`}</span>
            : qtyNoun}
          icon={<Layers className="h-4 w-4" />} />
        {/* Both of these say WHY when they are absent — see `costWhy`. The dash
            is correct on 60 of this book's positions and it is not the whole
            answer: "invested —" and "on cost" told a reader nothing about
            whether the figure was missing or the page was broken. */}
        {/* WHICH UNITS THE AVERAGE IS OVER, where that is not all of them. The
            figure is cost over the costed units (`measuredTotals`), and a reader
            comparing it with the Quantity tile beside it must be told the two
            cover different units (main's #88). */}
        <Kpi label="Avg cost"
          value={avgCost === null ? <AbsentValue /> : <span className="mono" data-stock-avg-cost={avgCost}>{price(avgCost)}</span>}
          sub={cost === null ? <span className="text-slate-500">{costWhy}</span>
            : carried ? <span title={carriedWhy} data-stock-cost-carried={carried.paid}>invested {money(cost)} &middot; as paid, across a class switch</span>
            : gross ? <span title={grossWhy} data-stock-cost-gross={gross.paid}>invested {money(cost)} &middot; as paid, stamp duty included</span>
            : costedShare ? <span data-stock-cost-covers={costedShare}
                title={`A cost is reported for ${costedShare}; the rest are held in an account whose statement reports none, so the average is over the ${costedShare.split(" of ")[0]} that have one.`}>
                invested {money(cost)} &middot; on {costedShare}</span>
            : `invested ${money(cost)}`}
          icon={<Coins className="h-4 w-4" />} />
        {/* ONE FIGURE OR NONE — never one statement's mark standing for the
            rest. See `cmpMarks` for what the split is and why the tile refuses
            it rather than picking, and `priceNote` for the five states. */}
        <Kpi label={fundVehicle ? "NAV" : "CMP"}
          value={<span data-stock-mark={cmpSplit ? "split" : cmp === null ? "none" : "one"}>{cmp ?? <AbsentValue />}</span>}
          delta={live && !cmpSplit ? dayPct : null}
          sub={<span className="text-slate-500" data-stock-mark-note data-statement-note={markNote?.short}
            title={markNote ? `${priceNote.tip} ${markNote.note}` : priceNote.tip}>{priceNote.line}{markNote ? ` · ${markNote.short}` : ""}</span>}
          icon={<Tag className="h-4 w-4" />} />
        <Kpi label="Unrealised P&L"
          value={pnl === null ? <AbsentValue /> : <span className={changeColor(pnl)}>{fmtFromBase(pnl, { compact: true, sign: true })}</span>}
          delta={ret}
          sub={pnl === null ? <span className="text-slate-500">{costWhy}</span>
            // A COMPUTED ZERO KEEPS ITS ZERO, AND ITS REASON GOES IN THE TILE.
            // (Measured: the book's cash rows net to ₹0.11 of paise rounding
            // between the printed cost and value, so "no P&L" would overstate it.)
            : rows.every((r) => r.assetClass === "Cash") ? "a balance — its cost and value are one amount"
            // FIFO — the realised gain on units already sold stays in the
            // return beside it, and the hover says over what.
            : <span title={fifoBasisNote(fifo, (n) => money(n))}>return · FIFO{fifo.realised ? ` · incl. ${money(fifo.realised, true)} realised` : ""}{costedShare ? ` · on ${costedShare}` : ""}</span>}
          icon={<TrendingUp className="h-4 w-4" />} />
        {/* ONE REALISED FIGURE, ON THE BOOK'S BASIS (DL-6). This tile read the
            runtime ledger while the Unrealised tile beside it read the book, and
            the two follow different rules: the ledger counts sales dated after
            the holding's statement, which the book's FIFO leaves out because
            those units are still IN the statement at its mark. So LKP's Belrise
            read +₹6.6 L "booked on exits" on units the page still showed as held.
            It reads the book's own `realizedPnL` now, and where sales came after
            the statement it says they are not counted. Null is not zero. */}
        <Kpi label="Realised P&L"
          value={rt.basis === "statements" && led === undefined ? "…"
            : realised == null ? <AbsentValue />
            : <span className={changeColor(realised)} data-stock-realised={realised}>{fmtFromBase(realised, { compact: true, sign: true })}</span>}
          sub={<span className={realised == null || rt.lotsAfter > 0 || rt.unreconciled != null ? "text-slate-500" : undefined}
            data-stock-realised-note={rt.lotsAfter} data-stock-realised-basis={rt.basis}
            data-stock-realised-unreconciled={rt.unreconciled ?? ""}
            data-stock-realised-covered={rt.covered} data-stock-realised-accounts={rt.accounts} title={realisedTip}>
            {realisedNote}
          </span>}
          icon={<Activity className="h-4 w-4" />} />
      </div>
      )}

      {/* ── THE PANEL ──────────────────────────────────────────────────────
          ONE TAB'S CONTENT, NEVER TWO. The others are UNMOUNTED rather than
          hidden: `display:none` keeps a node in the DOM but takes it out of
          `innerText`, so every text-struck check would read what it reads now
          while the page still paid to fetch a price history, a research
          document and an insider feed nobody opened.

          `min-h-0` is what makes `flex-1` shrink rather than grow the column
          past the window — without it the panel is as tall as its content and
          the page scrolls again, which is the whole of what was asked. */}
      <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto" data-stock-panel={tab}>

        {tab === "position" && (
          <div data-stock-section="position">
            {resolving ? resolvingNote : exited ? (
              unchecked ? (
                <Card className="mt-5" title="Position" subtitle="No statement in this book reports a current holding in this name.">
                  <p className="text-sm text-slate-400" data-stock-unchecked>
                    Whether your funds hold it could not be checked — the fund look-through did not load. Refresh to retry.
                  </p>
                </Card>
              ) : (
                <Card className="mt-5" title="Position" subtitle="This name is fully exited — no current holding.">
                  <p className="text-sm text-slate-400">Realised P&amp;L is in the strip above, and the dated history is on the Transactions tab.</p>
                </Card>
              )
            ) : (
              /* EVERY WAY THE FAMILY HOLDS IT, AS ONE TABLE (main's #88). A
                 company is held three ways — in the family's own accounts,
                 through a PMS manager, and inside the funds it holds — and the
                 route tabs are the card's own control, beside its title, so a
                 reader narrows the table without leaving the Position tab. A
                 fund folio or a cash line keeps its one table: "which of my
                 funds hold this" has no meaning for a fund. */
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
                            showing this column in entirety."* WHO CHOSE a position is
                            the distinction Stage 10j and 10L exist for, and the
                            mandate link is the door into the manager's own book, so
                            both ride in this cell. */}
                        <SortHeader col="managedBy" view={posView} align="left">Managed by · held via</SortHeader>
                        <SortHeader col="qty" view={posView}>Qty</SortHeader>
                        <SortHeader col="avgCost" view={posView}>Avg cost</SortHeader>
                        <SortHeader col="cmp" view={posView}
                          title="The per-unit mark this account's own statement prints, on its own report date — not a live quote and not market value divided by quantity. Where two statements report one holding they need not agree: a later statement carries a later price, and two rows of one scheme on one date that disagree are a discrepancy this book reports rather than averages.">CMP</SortHeader>
                        <SortHeader col="invested" view={posView}>Invested</SortHeader>
                        <SortHeader col="current" view={posView}>Market value</SortHeader>
                        <SortHeader col="pnl" view={posView}>Unreal. P&L</SortHeader>
                        <SortHeader col="return" view={posView}
                          title="HPR is the holding-period return — the total on cost from purchase to this statement's date, not annualised. CAGR appears beside it only where a lot register reports the purchase date and the holding is at least a year old; a shorter window is never compounded onto a year. XIRR appears only on a row that is a WHOLE account whose every payment in and out is dated — a fund folio, a drawdown fund — solved over the same record the Transactions card uses; a holding inside an account has no cash flows of its own, so it has none.">Return</SortHeader>
                      </Tr>
                    </thead>
                    <tbody className="divide-y divide-ink-700/60">
                      {heldTab === "all" ? (
                        <>
                          {/* EVERY ROUTE AS A SECTION OF ONE TABLE, in the order a
                              reader asks: what the family chose, what its managers
                              chose, and what its funds hold. A band only where
                              there are two or more — one section is already the
                              table. */}
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
                                `${ht.sections[route].lines + recordedIn(route).length} account${ht.sections[route].lines + recordedIn(route).length === 1 ? "" : "s"} · ${route === "direct" ? "the family's own demat or broking" : route === "manager" ? "chosen by a discretionary manager" : "route not stated"}`)}
                              {sortedPositions(ht.sections[route].positions).map(measuredRow)}
                              {recordedIn(route).map(recordedRow)}
                            </Fragment>
                          ))}
                        </>
                      ) : heldTab === "funds" ? (
                        fundLinesShown && fl.status === "ok"
                          ? <>{sortedFunds(fl.lines).map(fundRow)}{fundNote()}</>
                          : <>{emptyRoute("fund")}{fundNote()}</>
                      ) : ht.sections[TAB_ROUTE[heldTab]].lines > 0 || recordedIn(TAB_ROUTE[heldTab]).length > 0 ? (
                        <>
                          {sortedPositions(ht.sections[TAB_ROUTE[heldTab]].positions).map(measuredRow)}
                          {recordedIn(TAB_ROUTE[heldTab]).map(recordedRow)}
                        </>
                      ) : (
                        emptyRoute(TAB_ROUTE[heldTab])
                      )}
                    </tbody>
                    {/* THE FOOTER DRAWS ONLY WHERE THERE IS SOMETHING TO ADD UP.
                        A total of one line is the line again — and the strip above
                        already carries the statements' own totals — so a set of
                        one draws its line and nothing under it (the Polycab
                        table's rule). See `measuredFootShown` for the three. */}
                    {(measuredFootShown || derivedFootShown || exposureFootShown) && (
                      <tfoot className="border-t-2 border-ink-600 font-semibold">
                        {heldTab === "all" ? (
                          <>
                            {measuredFootShown && measuredFoot(rows,
                              tabsShown && fundLinesShown ? measuredLabel(measuredRoutes) : <>Total</>, "measured")}
                            {derivedFootShown && fl.status === "ok" && derivedFoot(fl.derived,
                              <>Inside your mutual funds <span className="font-normal text-champagne-400/80">· derived</span></>,
                              "derived", "derived", DERIVED_TITLE)}
                            {exposureFootShown && ht.total !== null && derivedFoot(ht.total,
                              <>Total exposure <span className="font-normal text-slate-400">· incl. derived</span></>,
                              "exposure", "exposure", EXPOSURE_TITLE)}
                          </>
                        ) : heldTab === "funds" ? (
                          derivedFootShown && fl.status === "ok" && derivedFoot(fl.derived,
                            <>Total inside your mutual funds <span className="font-normal text-champagne-400/80">· derived</span></>,
                            "derived", "derived", DERIVED_TITLE)
                        ) : measuredFootShown ? (
                          measuredFoot(measuredFootRows, measuredLabel([TAB_ROUTE[heldTab]]), "measured")
                        ) : null}
                      </tfoot>
                    )}
                  </table>
                </div>
                {/* CARRY BOTH, COUNT ONCE — and SAY SO where both are on screen.
                    Every row above is a statement as its issuer printed it, so a
                    name reported under two members has two rows; the Total is
                    the consolidated figure, which counts the holding once.
                    One line, the reasoning in its hover (main's Stage 10ci). */}
                {/* The count and both figures on the face, the reasoning in its
                    hover (Stage 10cp) — a reader dividing the rows by the Total
                    still finds the two figures that explain the gap. */}
                {visibleDup > 1 && (
                  <p className="border-t border-ink-700/60 px-4 py-2 text-[11px] text-slate-500" data-stock-dup-note
                    title="The same holding is reported on each of the statements listed. Both rows are shown as printed, and the Total counts the holding once — the same basis as the current value of holdings. Which statement owns it is a question about the family's affairs, not a parsing rule, so neither row is suppressed.">
                    One holding on {new Set(visibleMeasured.map((r) => r.accountId)).size} statements · rows{" "}
                    {money(sum(visibleMeasured.map((r) => r.marketValue)))} · counted once in the Total, {money(measuredTotals(visibleMeasured).mv)}
                  </p>
                )}
                {/* AND THE FUND LINES' OWN "COUNT ONCE", which no holding in this
                    book exercises today: a fund reported by two statements would
                    put its lines above at their printed values while the derived
                    total counts the fund once. Said where it would happen. */}
                {(heldTab === "all" || heldTab === "funds") && fl.status === "ok" && fl.printed - fl.derived > 1 && (
                  <p className="border-t border-ink-700/60 px-4 py-2 text-[11px] text-slate-500" data-held-fund-overlap
                    title="A fund two statements both report puts its lines above at the value each statement prints, while the derived total counts the fund once.">
                    The fund lines add to {money(fl.printed)} as printed; the derived total counts each fund once, at {money(fl.derived)}.
                  </p>
                )}
              </Card>
            )}
          </div>
        )}

        {tab === "activity" && (
          <div data-stock-section="activity">
            {/* ── HOLDING PERIOD & TAX — A CLICK, AS THE FAMILY ASKED ─────────
                *"And then tax maybe just make it a click."* It was a folded card
                under the account table; it is a card on this tab now, where the
                purchase dates it reads come from anyway — the dated buys below.
                The "Weight in book" row it carried is gone: the Holding value
                tile states the same figure on every tab. */}
            {/* NOTHING TO SPLIT ON A COMPANY HELD ONLY INSIDE FUNDS: every line
                in this card is about the family's OWN lots — cost, purchase
                dates, dividends — and there are none (main's #88). */}
            {resolving && resolvingNote}
            {fundOnly && led != null && led.txns.length === 0 && (
              <Card className="mt-5" title="Transactions">
                <p className="text-[12.5px] leading-relaxed text-slate-400" data-stock-activity="funds-only"
                  title={`No statement issued to this family records a buy or a sell of ${name}, so there is no lot, cost or tax split of your own to show. The transaction history, the tax split and the quantity account are all records of the family's own accounts; a company held only inside a fund is bought and sold by the fund, and the fund's own trades are not reported to this family.`}>
                  {/* ONE LINE, THE REASON ITS HOVER (Stage 10cp). */}
                  Held only inside your funds — no buy or sell of your own
                </p>
              </Card>
            )}
            {/* A RECORDED LINE IS THE FAMILY'S OWN HOLDING (Stage 10cz) — held in
                their own demat, and only not valued — so its holding period and
                tax card is drawn like any other holding's, each figure a dash
                naming why. It is a company held only inside a fund that has no
                card: that is the fund's holding, not the family's. */}
            {!exited && !fundOnly && !resolving && (
              <Card className="mt-5" title="Holding period & tax"
                subtitle="The long- and short-term cost split, the purchase dates and the dividends recorded for this holding">
                <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5" data-stock-tax>
                  {([
                    ["Long-term cost", ltCost === null ? <AbsentCell reason="the long/short split needs per-lot purchase dates, and only a lot register carries them — one account in this book issues one" /> : money(ltCost)],
                    ["Short-term cost", stCost === null ? <AbsentCell reason="the long/short split needs per-lot purchase dates, and only a lot register carries them — one account in this book issues one" /> : money(stCost)],
                    /* A purchase date only exists where the statements' window
                       covers the buy. Absent here means "not in this window", not
                       "never bought" — the reason says which. */
                    ["First bought", firstBought ? fmtDate(firstBought) : led === undefined ? "…" : <AbsentCell reason="no purchase in the window the transaction statements cover — this holding predates it" />],
                    ["Last added", lastAdded ? fmtDate(lastAdded) : led === undefined ? "…" : <AbsentCell reason="no purchase in the window the transaction statements cover" />],
                    ["Dividends recorded", div !== null && div > 0 ? money(div) : <AbsentCell reason="no dividend statement in this book records an event in this name" />],
                  ] as const).map(([label, value]) => (
                    <div key={label} className="rounded-xl border border-ink-700 bg-ink-900/60 px-3.5 py-2.5">
                      <div className="label-xs">{label}</div>
                      <div className="mono mt-1 text-[15px] font-semibold text-slate-100">{value}</div>
                    </div>
                  ))}
                </div>
                {/* No lot dates for most of this book, so the split is unknown —
                    say so rather than drawing an empty bar that reads as "all
                    short-term". */}
                {ltPct === null ? (
                  <p className="mt-2.5 text-[11px] text-slate-500">Long-term / short-term split <AbsentCell reason="No lot dates on the statements for this holding." /></p>
                ) : (
                  <>
                    <div className="mt-3 flex h-2.5 overflow-hidden rounded-full border border-ink-700">
                      <div style={{ width: `${ltPct}%`, background: "#10b981" }} />
                      <div style={{ width: `${100 - ltPct}%`, background: "rgba(245,158,11,.5)" }} />
                    </div>
                    <div className="mt-1.5 flex justify-between text-[10.5px] text-slate-500">
                      <span>Long-term {ltPct.toFixed(0)}%</span><span>Short-term {(100 - ltPct).toFixed(0)}%</span>
                    </div>
                  </>
                )}
              </Card>
            )}

            {/* OPENING, PLUS, MINUS, CLOSING — read off the depository statement,
                which prints all four. Above the tape deliberately: the family
                asked for the quantity account first and the dated rows second. */}
            {/* AN ACCOUNT HOLDING A RECORDED LINE HOLDS IT (Stage 10cz): Ankita's
                4,875 Kaynes are on the Position table above, "not valued" with
                the reason. Marking her window "held, and not valued here" too
                would say it twice, and with the wrong reason for a statement
                that does print a rate — a last movement's price. */}
            <QuantityMovement movements={moves} unmoved={unmoved} accounts={portfolio.accounts}
              held={new Set([...rows, ...recorded].map((p) => p.accountId))} />

            {/* Transaction history — on a company held only inside funds, only
                where the family's own accounts traded it (a name sold out of a
                demat that a fund still holds). Otherwise it would be a card
                explaining an empty window for a holding that was never theirs to
                trade, and the one line above says so instead. */}
            {!resolving && (!fundOnly || led === undefined || led === null || led.txns.length > 0) && (
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
                    {/* ONE SHORT LINE (Stage 10cp): the state and its window on the
                        face, the sentence saying what the window is on its hover. */}
                    <span className="max-w-md" data-stock-no-txn
                      title="No transaction in this name over the window the statements cover. A holding bought before that window and untraded since carries no row here — the transaction statements are a period record, not a lot history.">
                      No transactions
                      {led.periodFrom && led.periodTo ? <> · {fmtDate(led.periodFrom)} → {fmtDate(led.periodTo)}</> : null}
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
                          <td className="px-4 py-2 text-right mono text-slate-400">{t.rate == null ? <AbsentCell reason="this trade row reports no unit price and no settled amount on its statement" /> : price(t.rate)}</td>
                          <td className="px-4 py-2 text-right mono text-slate-200">{t.amount == null ? <AbsentCell reason="this trade row reports neither a net nor a gross amount on its statement" /> : fmtFromBase(t.amount, { compact: true })}</td>
                        </Tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </Card>
            )}
          </div>
        )}

        {tab === "market" && (
          <div data-stock-section="market">
            {/* A COMPANY'S PRICE, A SCHEME'S NAV, OR A DECIDED ABSENCE. The
                returns table carries the 52-week high and low as two of its own
                columns, which is why the separate Trading range card that printed
                the same two figures is gone. */}
            {/* …AND, UNDER THE PRICE RETURNS, THE RETURN THAT INCLUDES DIVIDENDS.
                The returns table is headed "excludes dividends"; this card is the
                other half of that sentence — each statement's window with the
                gross dividends declared in it and any split or bonus applied — so
                the two sit together, where a reader comparing a price return with
                a total return already is. It draws nothing for a holding that is
                not a company share. */}
            {researchHeld ? (
              researchAbsent ? (
                <Card className="mt-5" title="Price history & returns">
                  <p className="text-[12.5px] leading-relaxed text-slate-400" data-stock-research="funds-only"
                    title={`Price history is looked up by the company's NSE symbol. ${name} is held only inside your funds, so none of your statements names it and no symbol has been looked up for it. It is not a feed being down.`}>
                    {/* ONE LINE, THE REASON ITS HOVER (Stage 10cp). */}
                    No price history — held only inside your funds
                  </p>
                </Card>
              ) : resolvingNote
            ) : !notACompany ? (
              <>
                <ReturnsTable ticker={sym} name={name} />
                <CorporateActionReturns securityKey={securityKey} />
              </>
            ) : schemeHalves ? (
              <FundLookthrough part="nav" securityKey={securityKey} name={name} holdingValue={recordedOnly ? null : mv} asOfHolding={holdingAsOf} statementAsOf={statementAsOfEarliest}
                valuedAt={valuation.at} valuedBy={valuation.by} valuedDates={valuation.dates} />
            ) : (
              <Card className="mt-5" title={`Price history & returns — not applicable to ${notACompanyLabel}`}>
                <AbsentSection
                  what={assetClass === "Cash"
                    ? "No market price — a cash line is a balance"
                    : `No market price — ${notACompanyLabel} publishes no daily NAV`}
                  needs={assetClass === "Cash"
                    ? "A cash line is a balance, not a priced security, so there is no price history to chart and no returns series to measure. Its value is the one its statement prints, on the Position tab."
                    : "An AIF folio is not traded on an exchange and publishes no daily NAV — its manager strikes a NAV and the statement prints it. So there is no price history to chart and no returns series to measure here; the value and the date it was struck are on the Position tab."} />
              </Card>
            )}
          </div>
        )}

        {tab === "research" && (
          <div data-stock-section="research">
            {researchHeld ? (
              researchAbsent ? (
                <Card className="mt-5" title="Company research">
                  <p className="text-[12.5px] leading-relaxed text-slate-400" data-stock-research="funds-only"
                    title={`Research is looked up by the company's NSE symbol. ${name} is held only inside your funds, so none of your statements names it and no symbol has been looked up for it — which is why its ratios, financials and filings are not shown here. It is not a feed being down.`}>
                    {/* ONE LINE, THE REASON ITS HOVER (Stage 10cp). */}
                    No research — held only inside your funds
                  </p>
                </Card>
              ) : resolvingNote
            ) : !notACompany ? (
              <ResearchPanel ticker={sym} name={name} />
            ) : (
              <>
                {/* WHAT THE FUND HOLDS — the look-through, where a disclosure
                    resolves. It answers the question the card below has to refuse
                    for a company-shaped page: "what am I holding through this". */}
                {lookThroughHoldings && (
                  <FundLookthrough part="holdings" securityKey={securityKey} name={name} holdingValue={recordedOnly ? null : mv} asOfHolding={holdingAsOf} statementAsOf={statementAsOfEarliest}
                valuedAt={valuation.at} valuedBy={valuation.by} valuedDates={valuation.dates} />
                )}
                {/* ONE SHORT CARD, BY DECISION. A fund or a balance has no PE, no
                    balance sheet, no concall and no insider filing — absent
                    because of what the holding IS, never because a feed is down,
                    and said once rather than as five empty panels.

                    `data-stock-class` is the class a READER is told, which for a
                    liquid or arbitrage fund is Cash whatever wrapper its statement
                    typed it as — the family's instruction. */}
                {/* TWO SHORT LINES, the reasoning in their hovers (main's Stage
                    10ci). What a reader must still SEE is that this is a decided
                    absence rather than a broken feed, what the holding IS, and why
                    a fund shows no list of its companies — all three are on
                    screen. The hover lists what is absent WITHOUT "price history":
                    on these tabs a mutual fund's NAV history is on Price & returns. */}
                <Card className="mt-5" title={`Company research — not applicable to ${cashFund ? "a cash-equivalent fund" : notACompanyLabel}`}>
                  {/* ONE LINE: WHAT THE HOLDING IS (Stage 10cp). Why company research
                      does not apply, and — for a fund — why no list of its companies
                      is drawn, are the line's hover; the card's title already says
                      the research is not applicable, which is the decided absence a
                      reader must not take for a broken feed. */}
                  <p className="text-[12.5px] leading-relaxed text-slate-400" data-stock-research-na={fundVehicle ? "fund" : "balance"}
                    data-stock-class={cashFund ? "Cash" : assetClass ?? ""}
                    title={[
                      cashFund ? "The family counts an arbitrage or liquid fund as cash, whatever wrapper its statement typed it as." : "",
                      "Company research does not apply, so there is no PE, no balance sheet, no concall and no insider filing for it, and the panels that carry those for a company are absent here by decision rather than by a feed being down.",
                      fundVehicle ? "A mandate's constituents and a fund's are two different kinds of fact: under a mandate the family owns each share and the manager merely picks it, so every one is reported by name on a statement issued to this family. A fund unit is the opposite — the fund owns the companies, and what this family is told is only what the unit is worth." : "",
                      !fundVehicle ? ""
                        : arbitrage
                        ? "What it holds is not drawn: an arbitrage fund discloses its portfolio monthly like any mutual fund, and that portfolio is long shares hedged by short futures, so reading it as the family's exposure to those companies would print stock they do not carry. Its value counts whole, as cash."
                        : lookThroughHoldings
                        ? "Where the AMC's own monthly disclosure resolves, what the scheme holds is shown above. It is the AMC's document, not this family's, so the fund's value still stays whole here and in every total."
                        : "An AIF publishes no such disclosure, so no list of its companies can be shown: SEBI requires a monthly portfolio from a mutual fund and not from a Category II or III alternative fund, so there is no scheme document to join to this folio, and the fund's value stays whole.",
                    ].filter(Boolean).join(" ")}>
                    This holding is <span className="font-medium text-slate-300">{cashFund ? "Cash" : assetClassLabel(assetClass)}</span>
                    {cashFund
                      ? <> — {arbitrage ? "an arbitrage" : "a liquid"} fund</>
                      : fundVehicle
                      ? <> — one line for a manager&rsquo;s portfolio, not a company</>
                      : <> — a balance, not a company</>}
                  </p>
                </Card>
              </>
            )}
          </div>
        )}

        {tab === "targets" && (
          <div data-stock-section="targets">
            {/* The family's OWN judgements — a target price or a review date is as
                meaningful against a fund as against a company — so this tab is
                the same for every holding. */}
            {/* THE CARD WORKS OUT ITS OWN PRICE (`usePriceNow`), from the live
                quote or the fund's published NAV and never from `rows[0]` — the
                first array element's mark, which on a holding its statements
                price differently is one statement's figure standing for all of
                them (the header's own price stopped doing that at Stage 10bm). A
                statement mark is never what an alert is checked against. See
                `priceAlerts.ts` (Stage 10cq). */}
            <InvestmentTools securityKey={securityKey} name={name} />
          </div>
        )}
      </div>
    </div>
  );
}
